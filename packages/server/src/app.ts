import { Hono } from 'hono'
import { type AttachmentStore, createAttachmentStore, defaultAttachmentDir } from './attachments.ts'
import { type BusyTracker, createBusy } from './busy.ts'
import { type CommandBus, createCommandBus } from './command-bus.ts'
import { createEventBus, type EventBus } from './event-bus.ts'
import { createLiveness, type LivenessTracker } from './liveness.ts'
import { cookieAuth } from './middleware/cookie-auth.ts'
import { createProjectBus, type ProjectBus } from './project-bus.ts'
import { registerAdminRoutes } from './routes/admin.ts'
import { registerAuthRoutes } from './routes/auth.ts'
import { registerProjectRoutes } from './routes/projects.ts'
import { registerRequirementRoutes } from './routes/requirements.ts'
import { registerSessionAttachmentRoutes } from './routes/session-attachments.ts'
import { registerSessionRoutes } from './routes/sessions.ts'
import { registerTaskRoutes } from './routes/tasks.ts'
import { registerWorkerRoutes } from './routes/workers.ts'
import { registerWorkspaceRoutes } from './routes/workspaces.ts'
import { createSessionRuntime, type SessionRuntime } from './session-runtime.ts'
import type { Store } from './store/types.ts'
import type { AppEnv } from './views.ts'

export type { AppEnv } from './views.ts'

// HTTP surface, sliced by resource. Each routes/<X>.ts attaches its handlers
// to the shared Hono app so route paths stay flat (no /v1 prefix gymnastics).
//
// In-memory trackers — no DB persistence; all "right now":
//   workerLiveness — keyed by machineId; pinged by POST /workers/heartbeat.
//   runtime        — per-session active flag set by the worker via
//                    POST /sessions/:id/status, cleared on worker-stream drop.
//                    Source of `attached`.
//   busyTracker    — keyed by sessionId; toggled by POST /sessions/:id/events on
//                    turn_start (true) / turn_complete / turn_error (false).
//   commands       — server→worker command bus (session.start/stop/delete).
export const createApp = (
  store: Store,
  bus: EventBus = createEventBus(),
  workerLiveness: LivenessTracker = createLiveness(),
  runtime: SessionRuntime = createSessionRuntime(),
  busyTracker: BusyTracker = createBusy(),
  attachments: AttachmentStore = createAttachmentStore(defaultAttachmentDir()),
  commands: CommandBus = createCommandBus(),
  projects: ProjectBus = createProjectBus(),
): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.get('/health', c => c.json({ ok: true }))
  // /health + /auth are registered before the gate (and isExempt) so they stay
  // public; everything below is behind the cookie gate (enforced iff a user
  // exists), except the worker-bearer routes isExempt carves out.
  registerAuthRoutes(app, store)
  app.use('*', cookieAuth(store))
  registerWorkspaceRoutes(app, store)
  registerProjectRoutes(app, store, workerLiveness, runtime, busyTracker, projects)
  registerRequirementRoutes(app, store)
  registerTaskRoutes(app, store, projects)
  registerWorkerRoutes(app, store, workerLiveness, commands, runtime, projects)
  registerAdminRoutes(app, store, workerLiveness, runtime, busyTracker)
  registerSessionRoutes(
    app,
    store,
    bus,
    workerLiveness,
    runtime,
    busyTracker,
    attachments,
    commands,
    projects,
  )
  registerSessionAttachmentRoutes(app, store, attachments)
  return app
}
