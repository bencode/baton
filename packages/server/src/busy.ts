import type { Id } from '@baton/shared'

// In-memory turn-liveness tracker. An entry's presence = "a turn is open"; its
// lastActivityAt is refreshed by every worker session event (turn_start,
// sdk_event, and the periodic turn heartbeat). `read` additionally requires
// recent activity: a turn whose runner died or wedged stops looking busy once
// the TTL lapses, even if its turn_complete never arrived — this closes the
// "stuck thinking forever" hole at the source (read is correct even if the sweep
// never ran). The periodic sweep (busy-sweep.ts) turns that expiry into a real
// synthetic close event so the transcript and any client agree.
//
// Used by sessionWithView to derive `busy`, gated on `attached` (SessionRuntime):
// the UI shows busy only when both hold. Sibling to LivenessTracker — both are
// "right now" state with no DB persistence. The 90s default mirrors the worker
// daemon's stream-wedge window (one liveness philosophy across the system).
export const TURN_LIVENESS_TTL_MS = Number(process.env.BATON_TURN_LIVENESS_TTL_MS) || 90_000

type Entry = { lastActivityAt: number }

export type BusyTracker = {
  // turn_start: open a turn and stamp first activity.
  open(sessionId: Id, now?: number): void
  // Any worker event: refresh liveness — but only while a turn is open, so a late
  // sdk_event arriving after the close can't re-arm busy.
  refresh(sessionId: Id, now?: number): void
  // turn_complete / turn_error / child exit: close the turn.
  close(sessionId: Id): void
  // Force the open turn to read stale at once (web /abort against a wedged runner)
  // so the next sweep tick closes it even if the runner never responds.
  markStale(sessionId: Id): void
  // Open AND active within the TTL window.
  read(sessionId: Id, now?: number, ttlMs?: number): boolean
  forget(sessionId: Id): void
  // Open turns whose last activity has outlived the TTL — the sweep's worklist.
  expired(now: number, ttlMs?: number): Id[]
}

export const createBusy = (): BusyTracker => {
  const state = new Map<Id, Entry>()
  return {
    open(sessionId, now = Date.now()) {
      state.set(sessionId, { lastActivityAt: now })
    },
    refresh(sessionId, now = Date.now()) {
      const e = state.get(sessionId)
      if (e) e.lastActivityAt = now
    },
    close(sessionId) {
      state.delete(sessionId)
    },
    markStale(sessionId) {
      const e = state.get(sessionId)
      if (e) e.lastActivityAt = 0
    },
    read(sessionId, now = Date.now(), ttlMs = TURN_LIVENESS_TTL_MS) {
      const e = state.get(sessionId)
      return e !== undefined && now - e.lastActivityAt < ttlMs
    },
    forget(sessionId) {
      state.delete(sessionId)
    },
    expired(now, ttlMs = TURN_LIVENESS_TTL_MS) {
      const out: Id[] = []
      for (const [id, e] of state) if (now - e.lastActivityAt >= ttlMs) out.push(id)
      return out
    },
  }
}
