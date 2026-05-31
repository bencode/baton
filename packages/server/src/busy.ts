import type { Id } from '@baton/shared'

// In-memory busy tracker: per-session boolean indicating whether the daemon
// is currently inside a turn. Toggled by the route handler on turn_start /
// turn_complete / turn_error. Sibling to LivenessTracker — both are "right
// now" state with no DB persistence.
//
// Used by sessionWithView to derive `busy`, gated on `attached` (SessionRuntime):
// the UI shows the busy pulse only when both are true. Since `attached` flips
// false the instant the worker's command stream drops, a crashed worker stops
// looking busy immediately even if no turn_complete was emitted.
export type BusyTracker = {
  set(sessionId: Id, busy: boolean): void
  read(sessionId: Id): boolean
  forget(sessionId: Id): void
}

export const createBusy = (): BusyTracker => {
  const state = new Map<Id, boolean>()
  return {
    set(sessionId, busy) {
      if (busy) state.set(sessionId, true)
      else state.delete(sessionId)
    },
    read(sessionId) {
      return state.get(sessionId) === true
    },
    forget(sessionId) {
      state.delete(sessionId)
    },
  }
}
