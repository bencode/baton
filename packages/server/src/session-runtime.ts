import type { Id } from '@baton/shared'

// In-memory "is this session's worker child running" tracker — the source of
// truth for a session's `active`/`attached` state. Set by the worker via
// POST /sessions/:id/status (true on spawn, false on child exit), and cleared
// wholesale when the worker's command stream drops (forgetWorker) so a worker
// crash/restart flips all its sessions inactive immediately — no heartbeat
// window. Replaces the old 90s session-heartbeat liveness.
export type SessionRuntime = {
  setActive(sessionId: Id, workerId: Id, active: boolean): void
  isActive(sessionId: Id): boolean
  forget(sessionId: Id): void
  forgetWorker(workerId: Id): void
}

export const createSessionRuntime = (): SessionRuntime => {
  // sessionId -> owning workerId (presence = active)
  const active = new Map<Id, Id>()
  return {
    setActive(sessionId, workerId, isActive) {
      if (isActive) active.set(sessionId, workerId)
      else active.delete(sessionId)
    },
    isActive(sessionId) {
      return active.has(sessionId)
    },
    forget(sessionId) {
      active.delete(sessionId)
    },
    forgetWorker(workerId) {
      for (const [sid, wid] of active) if (wid === workerId) active.delete(sid)
    },
  }
}
