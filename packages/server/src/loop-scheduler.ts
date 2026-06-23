import { type DeliverDeps, deliverMessage } from './session-send.ts'

export type LoopSchedulerDeps = DeliverDeps

// Next beat from `now` (epoch ms): always one full interval out. A loop that fell
// behind (server asleep, worker offline for a while) realigns to now instead of
// back-firing every missed beat.
export const nextRunAfter = (now: number, intervalSec: number): number => now + intervalSec * 1000

// One scheduler pass: fire every due loop once. Delivered → 'ok'; worker offline
// → 'skipped_offline' (the beat is dropped, not queued). Either way the schedule
// advances to now + interval so missed beats don't pile up. Returns the number of
// loops processed (for logging/tests).
export const runDueLoops = async (deps: LoopSchedulerDeps, now: number): Promise<number> => {
  const { store, projects } = deps
  const due = await store.loops.due(now)
  for (const loop of due) {
    const session = await store.sessions.get(loop.sessionId)
    // Session cascade-deleted between the due() snapshot and here → the loop row
    // is gone too; nothing to advance.
    if (!session) continue
    const sent = await deliverMessage(session, { text: loop.message }, deps)
    await store.loops.update(loop.id, {
      lastRunAt: now,
      lastStatus: sent.delivered ? 'ok' : 'skipped_offline',
      nextRunAt: nextRunAfter(now, loop.intervalSec),
    })
    // The beat changed the loop's lastRunAt/lastStatus/nextRunAt — signal the
    // project stream so an open loops panel refreshes its row (the CRUD routes
    // bump on edits; this covers the scheduler's own writes).
    projects.publish(session.projectId, { resource: 'loops' })
  }
  return due.length
}

const TICK_MS = 30_000

// Periodic scheduler, mirroring startBusySweep: owned by the server lifecycle,
// runs unref'd (never keeps the event loop alive). A per-tick throw is logged,
// not fatal. tickMs is overridable for tests / via BATON_LOOP_TICK_MS.
export const startLoopScheduler = (
  deps: LoopSchedulerDeps,
  tickMs: number = TICK_MS,
): { stop: () => void } => {
  // Skip a beat while the previous pass is still draining — a backlog can make one
  // pass outlast the tick, and overlapping passes would re-read the same due loops
  // (nextRunAt not yet advanced) and double-fire them.
  let running = false
  const t = setInterval(() => {
    if (running) return
    running = true
    void runDueLoops(deps, Date.now())
      .catch(err => console.error('[loop-scheduler] threw', err))
      .finally(() => {
        running = false
      })
  }, tickMs)
  if (typeof t.unref === 'function') t.unref()
  return { stop: () => clearInterval(t) }
}
