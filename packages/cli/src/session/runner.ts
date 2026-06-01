import { spawn, spawnSync } from 'node:child_process'
import type { SessionEvent } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import type { FetchImpl } from './runner/attachments.ts'
import { claudeBin, maskedEnvKeys } from './runner/log.ts'
import type { SpawnImpl } from './runner/spawn.ts'
import { findTranscriptPath } from './runner/transcript.ts'
import { runTurn } from './runner/turn.ts'

// Re-export for tests + commands wiring.
export type { SpawnImpl } from './runner/spawn.ts'
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
  spawnImpl?: SpawnImpl
  eventSourceImpl?: new (url: string) => EventSourceLike
  // Authenticated fetch for pulling attachments into the worktree (carries the
  // worker Bearer so the gated /sessions/:id/attachments/:id route accepts it).
  fetchImpl?: FetchImpl
  log?: (msg: string) => void
}

type DaemonState = {
  firstSpawnDone: boolean
  seen: Set<number>
}

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

// Long-running loop: subscribe + drain. Server no longer persists events, so
// daemon state isn't recovered from a server query — `firstSpawnDone` reads
// the filesystem (claude's own session file) and the message queue starts
// empty. Messages sent while the daemon is offline are dropped by design.
export const runDaemon = async (
  config: SessionConfig,
  deps: RunnerDeps,
  signal: AbortSignal,
): Promise<void> => {
  const log = deps.log ?? (m => console.log(`[#${config.sessionId} ${config.name}] ${m}`))
  const sp = deps.spawnImpl ?? (spawn as SpawnImpl)
  const ESCtor =
    deps.eventSourceImpl ?? (EventSource as unknown as new (u: string) => EventSourceLike)

  log(`bin: ${claudeBin()}  cwd: ${config.worktreePath}`)
  log(`runtime env keys: ${maskedEnvKeys(deps.env)}`)

  const state: DaemonState = {
    firstSpawnDone: findTranscriptPath(config.agentSessionId) !== null,
    seen: new Set(),
  }
  const pendingQueue: SessionEvent[] = []
  let busy = false
  let lastActivity = Date.now()

  const drain = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      while (pendingQueue.length > 0 && !signal.aborted) {
        const msg = pendingQueue.shift()
        if (!msg) break
        const resuming = state.firstSpawnDone
        log(`▶ msg #${msg.sequence} (${resuming ? 'resume' : 'first'})`)
        const code = await runTurn(
          config,
          deps.worker,
          msg,
          resuming,
          sp,
          log,
          deps.env,
          deps.fetchImpl,
        )
        // Claude's session file exists after the first --session-id invocation
        // even on non-zero exit — future turns must --resume.
        state.firstSpawnDone = true
        lastActivity = Date.now()
        log(`✔ msg #${msg.sequence}${code === 0 ? '' : ` (exit ${code})`}`)
      }
    } finally {
      busy = false
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
    // Report active only now that we're subscribed — before this, a message
    // sent right after spawn would be missed (no replay on the live stream).
    () => {
      void deps.worker
        .setActive(true)
        .then(() => log('▲ active (subscribed)'))
        .catch(e => log(`status(active) failed: ${String(e)}`))
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
        if (shouldReap(lastActivity, Date.now(), busy, pendingQueue.length, idleMs)) {
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
