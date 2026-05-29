import { Hono } from 'hono'
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
// Two independent in-memory liveness trackers:
//   workerLiveness   — keyed by machineId; pinged by POST /workers/heartbeat
//   sessionLiveness  — keyed by sessionId.toString(); pinged by POST
//                      /sessions/me/heartbeat (bearer). Distinguishes 'machine
//                      online but no daemon for this session' from 'machine
//                      offline'. See packages/shared/src/domain/session.ts.
export const createApp = (
  store: Store,
  bus: EventBus = createEventBus(),
  workerLiveness: LivenessTracker = createLiveness(),
  sessionLiveness: LivenessTracker = createLiveness(),
): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.get('/health', c => c.json({ ok: true }))
  registerWorkspaceRoutes(app, store)
  registerProjectRoutes(app, store, workerLiveness, sessionLiveness)
  registerRequirementRoutes(app, store)
  registerTaskRoutes(app, store)
  registerWorkerRoutes(app, store, workerLiveness)
  registerSessionRoutes(app, store, bus, workerLiveness, sessionLiveness)
  return app
}
