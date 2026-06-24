import type { Id } from '@baton/shared'
import type { Context, Hono } from 'hono'
import type { AttachmentStore } from '../../attachments.ts'
import type { BusyTracker } from '../../busy.ts'
import type { CommandBus } from '../../command-bus.ts'
import type { EventBus } from '../../event-bus.ts'
import { workerBearerAuth } from '../../middleware/auth.ts'
import type { ProjectBus } from '../../project-bus.ts'
import type { SessionRuntime } from '../../session-runtime.ts'
import type { Store } from '../../store/types.ts'
import type { TerminalRuntime } from '../../terminal-runtime.ts'
import { type AppEnv, intParam, sessionWithView } from '../../views.ts'

// The injected singletons every session route group shares.
export type SessionRouteDeps = {
  store: Store
  bus: EventBus
  runtime: SessionRuntime
  busyTracker: BusyTracker
  attachments: AttachmentStore
  commands: CommandBus
  projects: ProjectBus
  terminal: TerminalRuntime
}

// Deps + the few helpers derived from them, built once and threaded into each
// route group (registerSessionLifecycle / Control / Io) so the groups carry no
// wiring. The inferred return type keeps the ownedByWorker union honest.
export const createSessionCtx = (deps: SessionRouteDeps) => {
  const { store, commands, runtime, busyTracker, projects, terminal } = deps
  const toView = async (s: Parameters<typeof sessionWithView>[0]) => {
    const counts = await store.loops.activeCountsBySessions([s.id])
    return sessionWithView(s, store, runtime, busyTracker, commands, terminal, counts.get(s.id) ?? 0)
  }
  // Tell project subscribers the session list changed so they refetch it.
  const bump = (projectId: Id) => projects.publish(projectId, { resource: 'sessions' })
  // Load a session, 404 if missing, 403 if the bearer worker doesn't own it.
  // Used by every worker-authed session route.
  const ownedByWorker = async (c: Context<AppEnv>) => {
    const id = intParam(c.req.param('id') ?? '')
    const s = await store.sessions.get(id)
    if (!s) return { error: c.json({ error: 'not found' }, 404) }
    if (s.workerId !== c.get('worker').id) return { error: c.json({ error: 'forbidden' }, 403) }
    return { id, session: s }
  }
  return { ...deps, auth: workerBearerAuth(store), toView, bump, ownedByWorker }
}

export type SessionRouteCtx = ReturnType<typeof createSessionCtx>

// Each group registers its slice of /sessions/* onto the shared app.
export type RegisterSessionGroup = (app: Hono<AppEnv>, ctx: SessionRouteCtx) => void
