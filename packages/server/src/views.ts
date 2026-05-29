import type { Id, Session, Worker } from '@baton/shared'
import type { LivenessTracker } from './liveness.ts'
import type { AuthVars } from './middleware/auth.ts'
import type { Store } from './store/types.ts'

// Parse an `:id` URL param to int; NaN is fine — downstream finds return null → 404.
export const intParam = (s: string): Id => Number(s)

export type AppEnv = { Variables: AuthVars }

// Merge a Session record with derived runtime view (alive, busy) for read endpoints.
export const sessionWithView = async (
  session: Session,
  store: Store,
  liveness: LivenessTracker,
): Promise<Session & { alive: boolean; busy: boolean }> => ({
  ...session,
  alive: session.machineId ? liveness.isAlive(session.machineId) : false,
  busy: await store.sessions.isBusy(session.id),
})

export const workerWithView = (
  worker: Worker,
  liveness: LivenessTracker,
): Worker & { alive: boolean } => ({
  ...worker,
  alive: liveness.isAlive(worker.machineId),
})
