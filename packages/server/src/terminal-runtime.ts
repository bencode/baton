import type { Id } from '@baton/shared'

// In-memory "this session has a live interactive terminal (ttyd)" tracker —
// the source of truth for SessionView.terminalUrl. Set by the worker via
// POST /sessions/:id/terminal-url after it spawns ttyd (cleared on close), and
// cleared wholesale when the worker's command stream drops (forgetWorker) so a
// worker crash/restart drops all its terminal URLs immediately. Pure runtime,
// like SessionRuntime (active) — never persisted; ttyd dies with the worker.
export type TerminalRuntime = {
  set(sessionId: Id, workerId: Id, url: string): void
  get(sessionId: Id): string | null
  clear(sessionId: Id): void
  forgetWorker(workerId: Id): void
}

export const createTerminalRuntime = (): TerminalRuntime => {
  // sessionId -> { workerId (for forgetWorker), url }
  const open = new Map<Id, { workerId: Id; url: string }>()
  return {
    set(sessionId, workerId, url) {
      open.set(sessionId, { workerId, url })
    },
    get(sessionId) {
      return open.get(sessionId)?.url ?? null
    },
    clear(sessionId) {
      open.delete(sessionId)
    },
    forgetWorker(workerId) {
      for (const [sid, v] of open) if (v.workerId === workerId) open.delete(sid)
    },
  }
}
