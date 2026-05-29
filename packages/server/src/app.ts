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
//   - Workspace / Project / Requirement / Task: thin CRUD over Store (M1).
//   - Worker: unauth register + heartbeat + close (machineId is the anchor).
//   - Session: register + close (bearer for /sessions/me/*).
//   - Chat protocol (M2.5):
//       upward  ← POST /sessions/:id/messages   (UI / CLI, no auth)
//               ← POST /sessions/me/events       (worker, bearer)
//       downward → GET  /sessions/:id/stream     (SSE: replay + tail)
export const createApp = (
  store: Store,
  bus: EventBus = createEventBus(),
  liveness: LivenessTracker = createLiveness(),
): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.get('/health', c => c.json({ ok: true }))
  registerWorkspaceRoutes(app, store)
  registerProjectRoutes(app, store, liveness)
  registerRequirementRoutes(app, store)
  registerTaskRoutes(app, store)
  registerWorkerRoutes(app, store, liveness)
  registerSessionRoutes(app, store, bus, liveness)
  return app
}
