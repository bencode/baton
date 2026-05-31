import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SessionEvent } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import { claudeBin, maskedEnvKeys } from './runner/log.ts'
import type { SpawnImpl } from './runner/spawn.ts'
import { generateTitle } from './runner/title.ts'
import { runTurn } from './runner/turn.ts'

// Re-export for tests + commands wiring.
export type { SpawnImpl } from './runner/spawn.ts'
export { runTurn } from './runner/turn.ts'

export type EventSourceLike = {
  onmessage: ((e: { data: string }) => void) | null
  onerror: (() => void) | null
  close(): void
}

export type RunnerDeps = {
  worker: WorkerClient
  env?: Record<string, string>
  spawnImpl?: SpawnImpl
  eventSourceImpl?: new (url: string) => EventSourceLike
  log?: (msg: string) => void
}

type DaemonState = {
  firstSpawnDone: boolean
  seen: Set<number>
}

// claude writes a session file on first `--session-id` invocation. Its on-disk
// layout is `~/.claude/projects/<flattened-cwd>/<agentSessionId>.jsonl`. We
// don't reproduce the cwd-flattening (it has edge cases); instead, walk every
// project dir and match by file name. Cheap — handful of dirs typically.
const claudeSessionFileExists = (agentSessionId: string): boolean => {
  const root = join(homedir(), '.claude', 'projects')
  try {
    for (const dir of readdirSync(root)) {
      const candidate = join(root, dir, `${agentSessionId}.jsonl`)
      try {
        if (statSync(candidate).isFile()) return true
      } catch {
        // not a file or doesn't exist; keep looking
      }
    }
  } catch {
    // ~/.claude/projects missing — fresh machine, first run
  }
  return false
}

// Build the SSE subscription wrapper. Each unseen `user_message` is forwarded
// to `onUserMessage`; seen sequences are deduped here (per-connection only —
// the server doesn't replay history anymore).
const subscribeStream = (
  url: string,
  ESCtor: new (u: string) => EventSourceLike,
  seen: Set<number>,
  log: (m: string) => void,
  onUserMessage: (ev: SessionEvent) => void,
): EventSourceLike => {
  const es = new ESCtor(url)
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
    firstSpawnDone: claudeSessionFileExists(config.agentSessionId),
    seen: new Set(),
  }
  const pendingQueue: SessionEvent[] = []
  let busy = false

  // Auto-title a still-default-named session from its first message. Fire-and-
  // forget (a throwaway claude call) so it never blocks the drain; runs once.
  let titled = false
  const maybeAutoTitle = (msg: SessionEvent): void => {
    if (titled || !/^session-\d+$/.test(config.name)) return
    titled = true
    const firstText =
      typeof (msg.payload as { text?: unknown }).text === 'string'
        ? (msg.payload as { text: string }).text
        : ''
    if (!firstText) return
    void generateTitle({
      worktreePath: config.worktreePath,
      firstUserText: firstText,
      spawnImpl: sp,
    })
      .then(title => deps.worker.setName(title))
      .then(() => log(`✎ titled session`))
      .catch(e => log(`title failed: ${String(e)}`))
  }

  const drain = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      while (pendingQueue.length > 0 && !signal.aborted) {
        const msg = pendingQueue.shift()
        if (!msg) break
        const resuming = state.firstSpawnDone
        log(`▶ msg #${msg.sequence} (${resuming ? 'resume' : 'first'})`)
        const code = await runTurn(config, deps.worker, msg, resuming, sp, log, deps.env)
        // Claude's session file exists after the first --session-id invocation
        // even on non-zero exit — future turns must --resume.
        state.firstSpawnDone = true
        log(`✔ msg #${msg.sequence}${code === 0 ? '' : ` (exit ${code})`}`)
        if (!resuming && code === 0) maybeAutoTitle(msg)
      }
    } finally {
      busy = false
    }
  }

  const es = subscribeStream(
    `${config.server}/sessions/${config.sessionId}/stream`,
    ESCtor,
    state.seen,
    log,
    ev => {
      pendingQueue.push(ev)
      void drain()
    },
  )
  await waitForAbort(signal)
  es.close()
  restoreTty()
}
