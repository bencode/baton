import type { Id, Requirement, Session, Task } from '@baton/shared'
import type { Context } from 'hono'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'

// Domain isolation: a non-admin user only sees workspaces they're bound to, and
// everything under them (project → requirement/task/session/worker). These
// helpers, called from user-facing handlers, return a 404 Response when the
// target is out of scope (404, not 403 — we don't leak that the id exists).
//
// Style mirrors sessions.ts `ownedByWorker`: a handler does
//   `const denied = await assertProjectAccess(c, store, id); if (denied) return denied`
// or, for by-id reads, `const s = await loadScopedSession(...); if (s instanceof Response) return s`.

type Ctx = Context<AppEnv>

// The set of workspace ids the current request may touch — or `null` when
// unrestricted (dev open table, worker daemon, or an admin user). Memoized per
// request so repeated checks cost one binding query.
export const accessibleWorkspaceIds = async (c: Ctx, store: Store): Promise<Set<Id> | null> => {
  const cached = c.get('scopeWsIds')
  if (cached !== undefined) return cached
  const result = await computeScope(c, store)
  c.set('scopeWsIds', result)
  return result
}

const computeScope = async (c: Ctx, store: Store): Promise<Set<Id> | null> => {
  if ((await store.users.count()) === 0) return null // dev: no users → API open
  if (c.get('workerId') != null) return null // worker daemon principal → exempt
  const userId = c.get('userId')
  const user = userId != null ? await store.users.get(userId) : null
  if (!user) return new Set() // authenticated but not a user identity → sees nothing
  if (user.isAdmin) return null // admin → all workspaces
  return new Set(await store.users.workspaceIds(user.id))
}

// 404 Response when the workspace is out of scope, else null (access granted).
export const assertWorkspaceAccess = async (
  c: Ctx,
  store: Store,
  workspaceId: Id,
): Promise<Response | null> => {
  const ids = await accessibleWorkspaceIds(c, store)
  if (ids === null || ids.has(workspaceId)) return null
  return c.json({ error: 'not found' }, 404)
}

// 404 when the project (resolved to its workspace) is out of scope, else null.
export const assertProjectAccess = async (
  c: Ctx,
  store: Store,
  projectId: Id,
): Promise<Response | null> => {
  const ids = await accessibleWorkspaceIds(c, store)
  if (ids === null) return null
  const p = await store.projects.get(projectId)
  if (!p || !ids.has(p.workspaceId)) return c.json({ error: 'not found' }, 404)
  return null
}

// 403 Response when the caller isn't an admin, else null. dev open table passes.
export const requireAdmin = async (c: Ctx, store: Store): Promise<Response | null> => {
  if ((await store.users.count()) === 0) return null
  const userId = c.get('userId')
  const user = userId != null ? await store.users.get(userId) : null
  return user?.isAdmin ? null : c.json({ error: 'forbidden' }, 403)
}

// Load a by-id resource and scope-check it in one step: returns the resource, or
// a 404 Response (missing or out of scope). Each resource carries projectId.
export const loadScopedSession = async (
  c: Ctx,
  store: Store,
  id: Id,
): Promise<Session | Response> => {
  const s = await store.sessions.get(id)
  if (!s) return c.json({ error: 'not found' }, 404)
  return (await assertProjectAccess(c, store, s.projectId)) ?? s
}

export const loadScopedTask = async (c: Ctx, store: Store, id: Id): Promise<Task | Response> => {
  const t = await store.tasks.get(id)
  if (!t) return c.json({ error: 'not found' }, 404)
  return (await assertProjectAccess(c, store, t.projectId)) ?? t
}

export const loadScopedRequirement = async (
  c: Ctx,
  store: Store,
  id: Id,
): Promise<Requirement | Response> => {
  const r = await store.requirements.get(id)
  if (!r) return c.json({ error: 'not found' }, 404)
  return (await assertProjectAccess(c, store, r.projectId)) ?? r
}
