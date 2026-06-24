import type { ProjectBus } from './project-bus.ts'
import type { Store } from './store/types.ts'
import type { TerminalBridge } from './terminal-bridge.ts'

const TICK_MS = 60_000
const IDLE_MS = 5 * 60_000 // close a terminal no viewer has watched for 5 min

// Periodically close interactive terminals nobody is viewing. The server holds the
// viewer sockets, so "0 viewers for IDLE_MS" is a direct read — no client
// heartbeat needed. closeWorker drops the worker's pty WS → the worker kills the
// pty, freeing the slot. This bounds terminals left open by a navigated-away /
// closed tab (the per-worker pty cap is the hard ceiling; this is the recycler).
export const startTerminalReaper = (deps: {
  bridge: TerminalBridge
  store: Store
  projects: ProjectBus
  idleMs?: number
  tickMs?: number
}): { stop: () => void } => {
  const { bridge, store, projects } = deps
  const idleMs = deps.idleMs ?? IDLE_MS
  const reap = async (): Promise<void> => {
    // reapIdle closes the idle terminals atomically and returns their ids; we just
    // signal the project streams so the rail/detail flip terminalOpen → false.
    for (const sessionId of bridge.reapIdle(idleMs)) {
      const s = await store.sessions.get(sessionId)
      if (s) projects.publish(s.projectId, { resource: 'sessions' })
    }
  }
  const timer = setInterval(() => void reap(), deps.tickMs ?? TICK_MS)
  timer.unref?.()
  return { stop: () => clearInterval(timer) }
}
