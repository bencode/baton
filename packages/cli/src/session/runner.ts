import { spawnSync } from 'node:child_process'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { isAgentWorking, type SessionEvent, unstartedUserMessages } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import type { FetchImpl } from './runner/attachments.ts'
import { maskedEnvKeys } from './runner/log.ts'
import type { QueryFn } from './runner/query.ts'
import { claudeExecutable } from './runner/sdk-env.ts'
import { findTranscriptPath } from './runner/transcript.ts'
import { runTurn } from './runner/turn.ts'

// Re-export for tests + commands wiring.
export type { QueryFn } from './runner/query.ts'
export { runTurn } from './runner/turn.ts'

export type EventSourceLike = {
  onmessage: ((e: { data: string }) => void) | null
  onerror: (() => void) | null
  onopen: (() => void) | null
  close(): void
}

export type RunnerDeps = {
  worker: WorkerClient
  env?: Record<string, string>
  queryFn?: QueryFn
  eventSourceImpl?: new (url: string) => EventSourceLike
  // Authenticated fetch for pulling attachments into the worktree (carries the
  // worker Bearer so the gated /sessions/:id/attachments/:id route accepts it).
  fetchImpl?: FetchImpl
  log?: (msg: string) => void
}

type DaemonState = {
  seen: Set<number>
}

// Decide whether the next turn can resume from durable provider state. Claude
// session ids are assigned before the first turn, so the id alone is not proof
// that its transcript exists. Codex starts with a pending sentinel and replaces
// it with the real thread id only after `thread.started`.
//
// Re-evaluate this before every queued message: a first turn can fail before the
// provider creates any state (for example, an unavailable model). In that case
// the next message must try the same fresh session id again instead of getting
// stuck resuming a conversation that does not exist.
export const isAgentConversationResumable = (
  config: SessionConfig,
  transcriptPath: (agentSessionId: string) => string | null = findTranscriptPath,
): boolean =>
  config.agentKind === 'codex'
    ? !config.agentSessionId.startsWith('pending:')
    : transcriptPath(config.agentSessionId) !== null

// Build the SSE subscription wrapper. We connect live-only (?live=1, no replay),
// so each `user_message` is forwarded to `onUserMessage`; the per-connection
// `seen` set guards against any duplicate delivery. `onReady` fires on connect
// (onopen) — the child reports itself active only then, so `attached` truly
// means "subscribed and ready to receive" (closes the spawn→send race).
const subscribeStream = (
  url: string,
  ESCtor: new (u: string) => EventSourceLike,
  seen: Set<number>,
  log: (m: string) => void,
  onUserMessage: (ev: SessionEvent) => void,
  onInterrupt: () => void,
  onReady: () => void,
): EventSourceLike => {
  const es = new ESCtor(url)
  es.onopen = onReady
  es.onmessage = e => {
    try {
      const ev = JSON.parse(e.data) as SessionEvent
      if (seen.has(ev.sequence)) return
      seen.add(ev.sequence)
      if (ev.type === 'user_message') onUserMessage(ev)
      // /abort (Esc): interrupt the in-flight turn without ending the session.
      else if (
        ev.type === 'system' &&
        (ev.payload as { action?: string } | null)?.action === 'interrupt'
      )
        onInterrupt()
    } catch {
      // skip malformed payloads
    }
  }
  es.onerror = () => log('sse error (eventsource will retry)')
  return es
}

const waitForAbort = (signal: AbortSignal): Promise<void> =>
  new Promise<void>(resolve => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })

// Reap an idle session child to free the worker's process pool: exit when no
// turn is running, the queue is empty, and nothing has arrived for idleMs. The
// session row + transcript persist; the next message resumes it. Pure → tested.
export const shouldReap = (
  lastActivity: number,
  now: number,
  busy: boolean,
  queueLen: number,
  idleMs: number,
): boolean => !busy && queueLen === 0 && now - lastActivity >= idleMs

// Idle timeout before a session child self-exits (overridable; default 30m).
const idleMsFromEnv = (): number => Number(process.env.BATON_SESSION_IDLE_MS) || 30 * 60_000

// claude (and other interactive children) enable terminal modes via direct
// /dev/tty access — DECCKM application cursor mode is the common offender,
// which leaves up-arrow showing as ^[OA in the user's shell once we exit.
// Shell out to `reset` on daemon shutdown — heavy-handed (clears screen),
// but trivially correct: it's the canonical "I don't care what was set,
// undo it all" command. No-op when stdout isn't a TTY (tests, redirection).
const restoreTty = (): void => {
  if (!process.stdout.isTTY) return
  try {
    spawnSync('reset', { stdio: 'inherit' })
  } catch {
    // best-effort; if reset isn't on PATH we leave the tty as-is
  }
}

// Long-running loop: subscribe + drain. The durable transcript (server DB) is
// the authoritative queue — on every (re)connect we reconcile against it
// (reconcile() below) and drain any user_message with no turn_start yet, so a
// message sent while this daemon was offline / reconnecting isn't stranded.
// Resume state is derived from the provider's durable state before each turn.
export const runDaemon = async (
  config: SessionConfig,
  deps: RunnerDeps,
  signal: AbortSignal,
): Promise<void> => {
  const log = deps.log ?? (m => console.log(`[#${config.sessionId} ${config.name}] ${m}`))
  const qf = deps.queryFn ?? query
  const ESCtor =
    deps.eventSourceImpl ?? (EventSource as unknown as new (u: string) => EventSourceLike)

  log(`bin: ${claudeExecutable() ?? '(sdk bundled)'}  cwd: ${config.worktreePath}`)
  log(`runtime env keys: ${maskedEnvKeys(deps.env)}`)

  const state: DaemonState = { seen: new Set() }
  const pendingQueue: SessionEvent[] = []
  let busy = false
  // True while reconcile() is awaiting the transcript — blocks the idle reaper
  // so a reconnect that's about to surface queued work can't be reaped mid-fetch
  // (it would otherwise exit before draining, leaving the message stranded until
  // the next user action). Idle reaping is otherwise unchanged.
  let reconciling = false
  let lastActivity = Date.now()
  // The in-flight turn's abort handle, so a session `interrupt` event (web
  // /abort, like Esc) can cancel it without killing the session.
  let currentTurn: AbortController | undefined

  const drain = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      while (pendingQueue.length > 0 && !signal.aborted) {
        const msg = pendingQueue.shift()
        if (!msg) break
        const resuming = isAgentConversationResumable(config)
        log(`▶ msg #${msg.sequence} (${resuming ? 'resume' : 'first'})`)
        const turnAbort = new AbortController()
        currentTurn = turnAbort
        const code = await runTurn(
          config,
          deps.worker,
          msg,
          resuming,
          qf,
          log,
          deps.env,
          deps.fetchImpl,
          turnAbort.signal,
        )
        currentTurn = undefined
        lastActivity = Date.now()
        log(`✔ msg #${msg.sequence}${code === 0 ? '' : ` (exit ${code})`}`)
      }
    } finally {
      busy = false
    }
  }

  // Close a dangling open turn (a turn_start with no trailing close) left by a
  // prior child that died mid-turn or whose turn_complete was lost. Idempotent:
  // a no-op when the transcript shows no open turn. A single synthetic turn_error
  // is enough — the server closes the turn on it (no turn_complete needed).
  const closeOrphanedTurn = async (reason: string): Promise<void> => {
    const events = await deps.worker.listEvents()
    if (!isAgentWorking(events)) return
    await deps.worker.emitEvent('turn_error', { message: reason, synthetic: true })
    log(`closed orphaned open turn (${reason})`)
  }

  // Drain the authoritative queue from the durable transcript: enqueue any
  // user_message with no turn_start yet that we haven't already queued. Runs on
  // every (re)connect, so a live SSE delivery missed during a reconnect gap,
  // zombie-worker wedge, or reap→respawn can't strand a message. Idempotent —
  // the shared `seen` set + the turn_start filter prevent any re-run.
  const reconcile = async (): Promise<void> => {
    reconciling = true
    try {
      const events = await deps.worker.listEvents()
      const pending = unstartedUserMessages(events)
      let added = 0
      for (const ev of pending) {
        if (state.seen.has(ev.sequence)) continue
        state.seen.add(ev.sequence)
        pendingQueue.push(ev)
        added++
      }
      if (added > 0) {
        log(`reconciled ${added} queued message(s) from transcript`)
        lastActivity = Date.now()
        void drain()
      } else if (pendingQueue.length === 0 && !busy && !currentTurn && isAgentWorking(events)) {
        // No work to run, yet the transcript shows an open turn → a prior child
        // abandoned it. Heal it now (faster than the server's TTL sweep). Guarded
        // so a real pending message (which opens its own turn) isn't pre-closed.
        await deps.worker.emitEvent('turn_error', {
          message: 'turn abandoned — runner restarted',
          synthetic: true,
        })
        log('reconcile: closed orphaned open turn from a prior child')
      }
    } catch (e) {
      log(`reconcile failed: ${String(e)}`)
    } finally {
      reconciling = false
    }
  }

  const es = subscribeStream(
    // live-only: the server now replays history to viewers, but the child must
    // not re-receive (and re-run) past user_messages on connect/resume.
    `${config.server}/sessions/${config.sessionId}/stream?live=1`,
    ESCtor,
    state.seen,
    log,
    ev => {
      lastActivity = Date.now()
      pendingQueue.push(ev)
      void drain()
    },
    () => {
      lastActivity = Date.now()
      if (currentTurn) {
        log('interrupt — aborting current turn')
        currentTurn.abort()
      } else {
        // No live turn here, but the transcript may hold a dangling open turn (a
        // prior child died mid-turn, or its turn_complete was lost). Close it so
        // the interrupt actually clears "thinking" instead of being a no-op.
        log('interrupt — no live turn; closing any orphaned open turn')
        void closeOrphanedTurn('interrupted by user').catch(e =>
          log(`orphan close failed: ${String(e)}`),
        )
      }
    },
    // Report active only now that we're subscribed — before this, a message
    // sent right after spawn would be missed (no replay on the live stream).
    // Then reconcile against the durable transcript to pick up anything that
    // landed while we weren't subscribed (initial spawn or a reconnect gap).
    () => {
      void deps.worker
        .setActive(true)
        .then(() => log('▲ active (subscribed)'))
        .catch(e => log(`status(active) failed: ${String(e)}`))
      void reconcile()
    },
  )
  // Idle watchdog: self-exit after idleMs of no activity so the worker's process
  // pool isn't held by dormant sessions. Exit reports inactive (daemon) and the
  // next message resumes this very session.
  const idleMs = idleMsFromEnv()
  let idleTimer: ReturnType<typeof setInterval> | undefined
  const reaped = new Promise<void>(resolve => {
    idleTimer = setInterval(
      () => {
        if (
          !reconciling &&
          shouldReap(lastActivity, Date.now(), busy, pendingQueue.length, idleMs)
        ) {
          log('idle — shutting down (resumes on next message)')
          resolve()
        }
      },
      Math.min(idleMs, 30_000),
    )
  })
  await Promise.race([waitForAbort(signal), reaped])
  if (idleTimer) clearInterval(idleTimer)
  es.close()
  restoreTty()
}
