import type { Id, Session, SessionView, Worker } from '@baton/shared'
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
): Promise<SessionView> => {
  const worker = await store.workers.get(session.workerId)
  return {
    ...session,
    worker: worker ?? unknownWorker(session.workerId, session.projectId),
    alive: worker ? workerLiveness.isAlive(worker.machineId) : false,
    attached: sessionLiveness.isAlive(String(session.id)),
    busy: await store.sessions.isBusy(session.id),
  }
}

// Fallback when worker row vanished (shouldn't happen given FK Restrict, but
// defensive — surfaces as offline rather than 500).
const unknownWorker = (workerId: Id, projectId: Id): Worker => ({
  id: workerId,
  projectId,
  machineId: '',
  name: '(missing)',
  hostname: '',
  startedAt: 0,
})

export const workerWithView = (
  worker: Worker,
  liveness: LivenessTracker,
): Worker & { alive: boolean } => ({
  ...worker,
  alive: liveness.isAlive(worker.machineId),
})
