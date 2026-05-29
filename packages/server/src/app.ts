import { Hono } from 'hono'
import { type AttachmentStore, createAttachmentStore, defaultAttachmentDir } from './attachments.ts'
import { type BusyTracker, createBusy } from './busy.ts'
import { createEventBus, type EventBus } from './event-bus.ts'
import { createLiveness, type LivenessTracker } from './liveness.ts'
import { registerProjectRoutes } from './routes/projects.ts'
import { registerRequirementRoutes } from './routes/requirements.ts'
import { registerSessionRoutes } from './routes/sessions.ts'
import { registerTaskRoutes } from './routes/tasks.ts'
import { registerWorkerRoutes } from './routes/workers.ts'
import { registerWorkspaceRoutes } from './routes/workspaces.ts'
import type { Store } from './store/types.ts'
import type { AppEnv } from './views.ts'

export type { AppEnv } from './views.ts'

// HTTP surface, sliced by resource. Each routes/<X>.ts attaches its handlers
// to the shared Hono app so route paths stay flat (no /v1 prefix gymnastics).
//
// Three independent in-memory trackers — no DB persistence; all "right now":
//   workerLiveness   — keyed by machineId; pinged by POST /workers/heartbeat
//   sessionLiveness  — keyed by sessionId.toString(); pinged by POST
//                      /sessions/me/heartbeat (bearer). Distinguishes 'machine
//                      online but no daemon for this session' from 'machine
//                      offline'.
//   busyTracker      — keyed by sessionId; toggled by POST /sessions/me/events
//                      on turn_start (true) / turn_complete / turn_error
//                      (false). Source of truth for the UI busy pulse since
//                      session events are no longer persisted server-side.
export const createApp = (
  store: Store,
  bus: EventBus = createEventBus(),
  workerLiveness: LivenessTracker = createLiveness(),
  sessionLiveness: LivenessTracker = createLiveness(),
  busyTracker: BusyTracker = createBusy(),
  attachments: AttachmentStore = createAttachmentStore(defaultAttachmentDir()),
): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.get('/health', c => c.json({ ok: true }))
  registerWorkspaceRoutes(app, store)
  registerProjectRoutes(app, store, workerLiveness, sessionLiveness, busyTracker)
  registerRequirementRoutes(app, store)
  registerTaskRoutes(app, store)
  registerWorkerRoutes(app, store, workerLiveness)
  registerSessionRoutes(app, store, bus, workerLiveness, sessionLiveness, busyTracker, attachments)
  return app
}
