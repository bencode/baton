import type { Store } from './store/types.ts'

// Periodic lease enforcer: any session whose heartbeat is older than the idle
// threshold has its running assignments released back to todo (and the session
// itself is marked idle). 90s threshold + 60s tick give workers ~3 heartbeat
// windows (30s each) before the safety net trips.
export type SweeperHandle = { stop: () => void }

export const startSweeper = (
  store: Store,
  options: { intervalMs?: number; idleThresholdMs?: number } = {},
): SweeperHandle => {
  const intervalMs = options.intervalMs ?? 60_000
  const idleThresholdMs = options.idleThresholdMs ?? 90_000
  const tick = async () => {
    try {
      const released = await store.sessions.sweepStale(Date.now(), idleThresholdMs)
      if (released > 0) console.log(`[sweeper] released ${released} stale assignment(s)`)
    } catch (err) {
      console.error('[sweeper] tick failed', err)
    }
  }
  const t = setInterval(tick, intervalMs)
  return { stop: () => clearInterval(t) }
}
