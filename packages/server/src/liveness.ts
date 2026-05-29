// In-memory worker liveness: a Map<machineId, lastPingTimestamp>. Server
// reads merge this with DB rows when responding to /workers and /sessions
// so consumers see a fresh `alive` boolean. By design no DB persistence —
// liveness is "right now" and the database is for "what happened".
//
// Heartbeat window: 90s. Daemons ping every 30s so two missed pings are
// tolerable. Two layers of cleanup keep the Map from leaking:
//   1. `isAlive` lazy-deletes any entry it observes to be stale (free).
//   2. `startLivenessPrune` sweeps the whole Map periodically as a safety
//      net for entries that no one happens to query.
const ALIVE_WINDOW_MS = 90_000

export type LivenessTracker = {
  ping(machineId: string): void
  isAlive(machineId: string): boolean
  forget(machineId: string): void
  prune(now?: number): number
  size(): number
}

export const createLiveness = (): LivenessTracker => {
  const last = new Map<string, number>()
  return {
    ping(machineId) {
      last.set(machineId, Date.now())
    },
    isAlive(machineId) {
      const t = last.get(machineId)
      if (t === undefined) return false
      if (Date.now() - t < ALIVE_WINDOW_MS) return true
      // Lazy cleanup: drop the stale entry as we notice it.
      last.delete(machineId)
      return false
    },
    forget(machineId) {
      last.delete(machineId)
    },
    prune(now = Date.now()) {
      let removed = 0
      for (const [m, t] of last) {
        if (now - t >= ALIVE_WINDOW_MS) {
          last.delete(m)
          removed += 1
        }
      }
      return removed
    },
    size() {
      return last.size
    },
  }
}

// Periodic sweep helper. `intervalMs` defaults to 60s — runs in the same
// process, doesn't keep the event loop alive on its own (`.unref()`).
// Caller gets a `stop()` handle for clean shutdown.
export const startLivenessPrune = (
  liveness: LivenessTracker,
  intervalMs = 60_000,
): { stop: () => void } => {
  const t = setInterval(() => {
    try {
      liveness.prune()
    } catch (err) {
      console.error('[liveness] prune threw', err)
    }
  }, intervalMs)
  if (typeof t.unref === 'function') t.unref()
  return { stop: () => clearInterval(t) }
}
