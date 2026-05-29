import { spawn } from 'node:child_process'
import type { SessionEvent } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { ApiClient, WorkerClient } from '../client.ts'
import type { SessionConfig } from './config.ts'
import { claudeBin, maskedEnvKeys } from './runner/log.ts'
import type { SpawnImpl } from './runner/spawn.ts'
import { runTurn } from './runner/turn.ts'

// Re-export for tests + commands wiring.
export type { SpawnImpl } from './runner/spawn.ts'
export { runTurn } from './runner/turn.ts'

export type EventSourceLike = {
  onmessage: ((e: { data: string }) => void) | null
  onerror: (() => void) | null
  close(): void
}

// Open-coded for tests: pass a mock EventSource ctor + a mock spawn.
export type RunnerDeps = {
  client: ApiClient
  worker: WorkerClient
  // Env vars merged on top of process.env when spawning claude. Set at
  // `session run` time so proxy / mirror configs are runtime concerns, not
  // baked into the session record.
  env?: Record<string, string>
  spawnImpl?: SpawnImpl
  // Default uses the eventsource package; tests pass a fake constructor.
  eventSourceImpl?: new (
    url: string,
  ) => EventSourceLike
  log?: (msg: string) => void
}

type DaemonState = {
  pendingQueue: SessionEvent[]
  successfulTurns: number
  seen: Set<number>
}

const foldHistory = (history: SessionEvent[]): DaemonState => ({
  // Resume only after a turn that exited 0 — a failed first attempt leaves
  // claude's session file uncreated, so the next turn must re-use --session-id.
  successfulTurns: history.filter(e => {
    if (e.type !== 'turn_complete') return false
    const p = e.payload as { exitCode?: unknown } | null
    return p?.exitCode === 0
  }).length,
  pendingQueue: history.filter(e => e.type === 'user_message' && e.processedAt == null),
  seen: new Set(history.map(e => e.sequence)),
})

const startHeartbeat = (
  client: ApiClient,
  worker: WorkerClient,
  machineId: string,
  log: (m: string) => void,
): NodeJS.Timeout => {
  // Two pings every tick: worker level (per-machine liveness) and session
  // level (per-session 'attached' flag). Worker keeps machine alive in UI;
  // session-level tells the UI 'this session has a daemon' vs 'machine is up
  // but nobody's running this session'. Immediate ping seeds both so a `send`
  // right after `start` doesn't see stale alive=false / attached=false.
  const ping = (): void => {
    void client.workers
      .heartbeat(machineId)
      .catch(e => log(`worker heartbeat failed: ${String(e)}`))
    void worker.heartbeat().catch(e => log(`session heartbeat failed: ${String(e)}`))
  }
  ping()
  return setInterval(ping, 30_000)
}

// Build the SSE subscription wrapper. Each unseen `user_message` not yet
// processed is forwarded to `onUserMessage`; seen sequences are deduped here.
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
      if (ev.type === 'user_message' && ev.processedAt == null) onUserMessage(ev)
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

// Long-running loop: subscribe + drain. Single-flight per session via `busy`.
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

  const state = foldHistory(await deps.client.sessions.listEvents(config.sessionId))
  let busy = false
  const drain = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      while (state.pendingQueue.length > 0 && !signal.aborted) {
        const msg = state.pendingQueue.shift()
        if (!msg) break
        const resuming = state.successfulTurns > 0
        log(`▶ msg #${msg.sequence} (${resuming ? 'resume' : 'first'})`)
        const code = await runTurn(config, deps.worker, msg, resuming, sp, log, deps.env)
        if (code === 0) state.successfulTurns += 1
        log(`✔ msg #${msg.sequence}${code === 0 ? '' : ` (exit ${code})`}`)
      }
    } finally {
      busy = false
    }
  }

  const hb = startHeartbeat(deps.client, deps.worker, config.workerMachineId, log)
  void drain()
  const es = subscribeStream(
    `${config.server}/sessions/${config.sessionId}/stream`,
    ESCtor,
    state.seen,
    log,
    ev => {
      state.pendingQueue.push(ev)
      void drain()
    },
  )
  await waitForAbort(signal)
  es.close()
  clearInterval(hb)
}
