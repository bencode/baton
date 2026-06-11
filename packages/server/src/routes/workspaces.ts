import type { Hono } from 'hono'
import {
  accessibleWorkspaceIds,
  assertWorkspaceAccess,
  requireAdmin,
} from '../middleware/domain-scope.ts'
import type { Store, WorkspacePatch } from '../store/types.ts'
import { type AppEnv, intParam, isUniqueViolation } from '../views.ts'

export const registerWorkspaceRoutes = (app: Hono<AppEnv>, store: Store): void => {
  // Only admins create workspaces (domain isolation: members are bound, not self-serve).
  app.post('/workspaces', async c => {
    const denied = await requireAdmin(c, store)
    if (denied) return denied
    const body = (await c.req.json()) as { name?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    return c.json(await store.workspaces.create({ name: body.name }), 201)
  })
  // Scope: admins/dev see all; a bound user sees only their workspaces.
  app.get('/workspaces', async c => {
    const ids = await accessibleWorkspaceIds(c, store)
    if (ids === null) return c.json(await store.workspaces.list())
    const userId = c.get('userId')
    return c.json(userId == null ? [] : await store.workspaces.listForUser(userId))
  })
  app.get('/workspaces/:id', async c => {
    const id = intParam(c.req.param('id'))
    const denied = await assertWorkspaceAccess(c, store, id)
    if (denied) return denied
    const w = await store.workspaces.get(id)
    return w ? c.json(w) : c.json({ error: 'not found' }, 404)
  })
  app.get('/workspaces/:id/projects', async c => {
    const id = intParam(c.req.param('id'))
    const denied = await assertWorkspaceAccess(c, store, id)
    if (denied) return denied
    return c.json(await store.projects.listByWorkspace(id))
  })
  app.patch('/workspaces/:id', async c => {
    const id = intParam(c.req.param('id'))
    const denied = await assertWorkspaceAccess(c, store, id)
    if (denied) return denied
    if (!(await store.workspaces.get(id))) return c.json({ error: 'not found' }, 404)
    const patch = (await c.req.json()) as WorkspacePatch
    try {
      return c.json(await store.workspaces.update(id, patch))
    } catch (e) {
      if (isUniqueViolation(e)) return c.json({ error: 'name already in use' }, 409)
      throw e
    }
  })
  app.delete('/workspaces/:id', async c => {
    const id = intParam(c.req.param('id'))
    const denied = await assertWorkspaceAccess(c, store, id)
    if (denied) return denied
    if (!(await store.workspaces.get(id))) return c.json({ error: 'not found' }, 404)
    await store.workspaces.delete(id)
    return c.body(null, 204)
  })
}
