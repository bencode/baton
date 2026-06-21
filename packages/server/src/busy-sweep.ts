import { isAgentWorking } from '@baton/shared'
import { type BusyTracker, TURN_LIVENESS_TTL_MS } from './busy.ts'
import type { EventBus } from './event-bus.ts'
import type { ProjectBus } from './project-bus.ts'
import type { Store } from './store/types.ts'

export type SweepDeps = {
  store: Store
  bus: EventBus
  projects: ProjectBus
  busy: BusyTracker
}

// Close turns whose runner went silent past the TTL. `busy.read` already reports
// such a turn as not-busy (the TTL veto), so the server view is correct even if
// this never runs — but the frontend transcript and any event-deriving client
// also need an honest close. This appends a synthetic turn_error ("turn
// abandoned") so a real turn-error capsule shows up and the open turn resolves.
//
// Idempotent: `busy.close()` right after means the next tick's `expired()` won't
// list it again; a per-id re-check skips a session that closed (real turn_complete)
// or was refreshed (a late heartbeat) in the race between the snapshot and here.
export const sweepExpired = async (
  deps: SweepDeps,
  now: number,
  ttlMs: number = TURN_LIVENESS_TTL_MS,
): Promise<number> => {
  const { store, bus, projects, busy } = deps
  let closed = 0
  for (const id of busy.expired(now, ttlMs)) {
    const session = await store.sessions.get(id)
    if (!session) {
      busy.forget(id)
      continue
    }
    // Re-check after the await: a real close removes the entry; a heartbeat
    // refresh makes it fresh again. Either way, leave it alone.
    const stillOpen = busy.read(id, now, Number.POSITIVE_INFINITY)
    const refreshed = busy.read(id, now, ttlMs)
    if (!stillOpen || refreshed) continue
    // Belt-and-suspenders against tracker/DB drift: only synthesize a close when
    // the transcript truly shows a dangling open turn.
    const recent = await store.sessions.listEvents(id)
    if (!isAgentWorking(recent)) {
      busy.close(id)
      continue
    }
    const ev = await store.sessions.appendEvent(id, 'turn_error', {
      message: 'turn abandoned — worker went silent',
      synthetic: true,
    })
    busy.close(id)
    bus.publish(id, ev)
    projects.publish(session.projectId, { resource: 'sessions' })
    closed += 1
  }
  return closed
}

// Periodic sweep, mirroring startPresencePrune: a safety net owned by the server
// lifecycle. Tick at min(ttl, 30s) so a stranded turn is closed within ~30s of
// the TTL. Runs unref'd (doesn't keep the event loop alive); returns stop().
export const startBusySweep = (
  deps: SweepDeps,
  ttlMs: number = TURN_LIVENESS_TTL_MS,
): { stop: () => void } => {
  const t = setInterval(
    () => {
      void sweepExpired(deps, Date.now(), ttlMs).catch(err =>
        console.error('[busy-sweep] threw', err),
      )
    },
    Math.min(ttlMs, 30_000),
  )
  if (typeof t.unref === 'function') t.unref()
  return { stop: () => clearInterval(t) }
}
