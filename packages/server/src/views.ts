import type { Id, Session, SessionView, Worker } from '@baton/shared'
import type { BusyTracker } from './busy.ts'
import type { LivenessTracker } from './liveness.ts'
import type { AuthVars } from './middleware/auth.ts'
import type { SessionRuntime } from './session-runtime.ts'
import type { Store } from './store/types.ts'

// Parse an `:id` URL param to int; NaN is fine — downstream finds return null → 404.
export const intParam = (s: string): Id => Number(s)

// Prisma unique-constraint violation (P2002) — a rename/create hitting a taken
// name. Routes map it to 409 instead of a 500.
export const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'

// Validate an incoming external association. Any HTTP client can send one
// (only the CLI runs parseIssueUrl), and the (projectId, source, number)
// unique constraint is meaningless when number is missing — so writes must
// carry the full shape. Routes 400 on `external` values that fail this.
export const isExternalRef = (e: unknown): boolean => {
  if (typeof e !== 'object' || e === null) return false
  const r = e as Record<string, unknown>
  const numberOk = typeof r.number === 'number' && Number.isInteger(r.number) && r.number > 0
  return r.source === 'github' && numberOk && (r.url === undefined || typeof r.url === 'string')
}

export type AppEnv = { Variables: AuthVars }

// Merge a Session record with derived runtime view + the worker it belongs to.
// The worker join is required (Session.workerId is NOT NULL FK); we still
// defensively allow worker=null to surface as alive=false rather than 500 if
// somehow the worker was deleted out from under the FK.
export const sessionWithView = async (
  session: Session,
  store: Store,
  workerLiveness: LivenessTracker,
  runtime: SessionRuntime,
  busyTracker: BusyTracker,
): Promise<SessionView> => {
  const worker = await store.workers.get(session.workerId)
  // attached = "the worker has a live child process for this session" — set by
  // the worker on spawn/exit (POST /sessions/:id/status) and cleared instantly
  // when the worker's command stream drops. busy additionally requires an
  // unresolved turn_start; either false → busy=false.
  const attached = runtime.isActive(session.id)
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
