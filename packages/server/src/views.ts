import type { Id, Session, SessionView, Worker } from '@baton/shared'
import type { BusyTracker } from './busy.ts'
import type { CommandBus } from './command-bus.ts'
import type { AuthVars } from './middleware/auth.ts'
import type { SessionRuntime } from './session-runtime.ts'
import type { Store } from './store/types.ts'
import type { TerminalBridge } from './terminal-bridge.ts'

// Parse an `:id` URL param to int; NaN is fine — downstream finds return null → 404.
export const intParam = (s: string): Id => Number(s)

// Prisma unique-constraint violation (P2002) — a rename/create hitting a taken
// name. Routes map it to 409 instead of a 500.
export const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'

export type AppEnv = { Variables: AuthVars }

// Merge a Session record with derived runtime view + the worker it belongs to.
// The worker join is required (Session.workerId is NOT NULL FK); we still
// defensively allow worker=null to surface as connected=false rather than 500 if
// somehow the worker was deleted out from under the FK.
export const sessionWithView = async (
  session: Session,
  store: Store,
  runtime: SessionRuntime,
  busyTracker: BusyTracker,
  commands: CommandBus,
  terminal: TerminalBridge,
  // Enabled-loop count for this session (caller-supplied so the list path can
  // batch one query for all sessions instead of an N+1). Defaults to 0.
  activeLoops = 0,
): Promise<SessionView> => {
  const worker = await store.workers.get(session.workerId)
  // connected = the worker's command stream is open (commands.has) — can take
  // session.start. attached = the worker has a live child process for THIS session
  // (POST /sessions/:id/status). busy additionally requires an unresolved
  // turn_start; either attached/busy false → busy=false.
  const attached = runtime.isActive(session.id)
  return {
    ...session,
    worker: worker ?? unknownWorker(session.workerId, session.projectId),
    connected: worker ? commands.has(worker.id) : false,
    attached,
    busy: attached && busyTracker.read(session.id),
    activeLoops,
    terminalOpen: terminal.isOpen(session.id),
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

// connected = this worker's daemon is streaming right now (commands.has(id)) —
// the per-worker "can take commands" truth. Passed explicitly so this stays free
// of the command-bus dependency.
export const workerWithView = (
  worker: Worker,
  connected: boolean,
): Worker & { connected: boolean } => ({
  ...worker,
  connected,
})
