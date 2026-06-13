import type { AdminOverview } from '@baton/shared'
import type { Hono } from 'hono'
import type { BusyTracker } from '../busy.ts'
import type { CommandBus } from '../command-bus.ts'
import type { LivenessTracker } from '../liveness.ts'
import { requireAdmin } from '../middleware/domain-scope.ts'
import type { SessionRuntime } from '../session-runtime.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, workerWithView } from '../views.ts'

// Fleet overview for the admin ops board (web /ops): one call returns the
// whole workspace → project → worker → session tree as flat lists with the
// live runtime flags merged in. Cross-workspace on purpose, so it sits behind
// requireAdmin (dev open table passes, like the rest of the auth model).
export const registerAdminRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  workerLiveness: LivenessTracker,
  runtime: SessionRuntime,
  busyTracker: BusyTracker,
  commands: CommandBus,
): void => {
  app.get('/admin/overview', async c => {
    const denied = await requireAdmin(c, store)
    if (denied) return denied
    const [workspaces, projects, workers, sessions] = await Promise.all([
      store.workspaces.list(),
      store.projects.listAll(),
      store.workers.listAll(),
      store.sessions.listAll(),
    ])
    const overview: AdminOverview = {
      workspaces,
      projects,
      workers: workers.map(w => workerWithView(w, workerLiveness, commands.has(w.id))),
      // No per-session worker join (unlike sessionWithView) — the workers list
      // above already carries alive, and the client groups by workerId.
      sessions: sessions.map(s => {
        const attached = runtime.isActive(s.id)
        return { ...s, attached, busy: attached && busyTracker.read(s.id) }
      }),
    }
    return c.json(overview)
  })
}
