import type { Hono } from 'hono'
import type { ArtifactFileStore } from '../artifacts.ts'
import {
  accessibleWorkspaceIds,
  assertWorkspaceAccess,
  requireAdmin,
} from '../middleware/domain-scope.ts'
import type { Store, WorkspacePatch } from '../store/types.ts'
import { type AppEnv, intParam, isUniqueViolation } from '../views.ts'

export const registerWorkspaceRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  artifactFiles: ArtifactFileStore,
): void => {
  // Only admins create workspaces (domain isolation: members are bound, not self-serve).
  app.post('/workspaces', async c => {
    const denied = await requireAdmin(c, store)
    if (denied) return denied
    const body = (await c.req.json()) as { name?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    return c.json(await store.workspaces.create({ name: body.name }), 201)
  })
  // Scope: admins/dev see all; a bound user or a worker sees only its workspaces.
  app.get('/workspaces', async c => {
    const ids = await accessibleWorkspaceIds(c, store)
    const all = await store.workspaces.list()
    return c.json(ids === null ? all : all.filter(w => ids.has(w.id)))
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
    const projects = await store.projects.listByWorkspace(id)
    await store.workspaces.delete(id)
    await Promise.all(projects.map(project => artifactFiles.forgetProject(project.id)))
    return c.body(null, 204)
  })
}
