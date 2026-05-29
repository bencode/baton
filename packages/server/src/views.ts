import type { Id, Session, SessionView, Worker } from '@baton/shared'
import type { BusyTracker } from './busy.ts'
import type { LivenessTracker } from './liveness.ts'
import type { AuthVars } from './middleware/auth.ts'
import type { Store } from './store/types.ts'

// Parse an `:id` URL param to int; NaN is fine — downstream finds return null → 404.
export const intParam = (s: string): Id => Number(s)

export type AppEnv = { Variables: AuthVars }

// Merge a Session record with derived runtime view + the worker it belongs to.
// The worker join is required (Session.workerId is NOT NULL FK); we still
// defensively allow worker=null to surface as alive=false rather than 500 if
// somehow the worker was deleted out from under the FK.
export const sessionWithView = async (
  session: Session,
  store: Store,
  workerLiveness: LivenessTracker,
  sessionLiveness: LivenessTracker,
  busyTracker: BusyTracker,
): Promise<SessionView> => {
  const worker = await store.workers.get(session.workerId)
  // busy semantically = "a daemon is currently running a turn". Requires both:
  //   1. busyTracker has been toggled true by an unresolved turn_start
  //   2. session-level heartbeat is alive (daemon is still around to finish)
  // Either being false → busy=false. SIGKILL / crash / partition all collapse
  // via attached → false within the 90s heartbeat window; busyTracker itself
  // is reset when the daemon properly emits turn_complete / turn_error.
  const attached = sessionLiveness.isAlive(String(session.id))
  return {
    ...session,
    worker: worker ?? unknownWorker(session.workerId, session.projectId),
    alive: worker ? workerLiveness.isAlive(worker.machineId) : false,
    attached,
    busy: attached && busyTracker.read(session.id),
  }
}

// Fallback when worker row vanished (shouldn't happen given FK Cascade kept
// in sync, but defensive — surfaces as offline rather than 500).
const unknownWorker = (workerId: Id, projectId: Id): Worker => ({
  id: workerId,
  projectId,
  machineId: '',
  name: '(missing)',
  hostname: '',
  createdAt: 0,
})

export const workerWithView = (
  worker: Worker,
  liveness: LivenessTracker,
): Worker & { alive: boolean } => ({
  ...worker,
  alive: liveness.isAlive(worker.machineId),
})
