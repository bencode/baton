import type { Id, RequirementStatus, ResourceRef } from '@baton/shared'
import type { Hono } from 'hono'
import { assertProjectAccess, loadScopedRequirement } from '../middleware/domain-scope.ts'
import type { RequirementPatch, Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

export const registerRequirementRoutes = (app: Hono<AppEnv>, store: Store): void => {
  app.post('/requirements', async c => {
    const reqBody = (await c.req.json()) as {
      projectId?: Id
      title?: string
      description?: string
      body?: string
      resources?: ResourceRef[]
      status?: RequirementStatus
    }
    if (!reqBody.projectId || !reqBody.title)
      return c.json({ error: 'projectId and title required' }, 400)
    const { projectId, title, description, body, resources, status } = reqBody
    const denied = await assertProjectAccess(c, store, projectId)
    if (denied) return denied
    return c.json(
      await store.requirements.create({
        projectId,
        title,
        description,
        body,
        resources,
        status,
      }),
      201,
    )
  })
  app.get('/requirements/:id', async c => {
    const r = await loadScopedRequirement(c, store, intParam(c.req.param('id')))
    return r instanceof Response ? r : c.json(r)
  })
  app.get('/requirements/:id/full', async c => {
    const id = intParam(c.req.param('id'))
    const r = await loadScopedRequirement(c, store, id)
    if (r instanceof Response) return r
    const full = await store.getRequirementWithTasks(id)
    return full ? c.json(full) : c.json({ error: 'not found' }, 404)
  })
  app.get('/requirements/:id/tasks', async c => {
    const id = intParam(c.req.param('id'))
    const r = await loadScopedRequirement(c, store, id)
    if (r instanceof Response) return r
    return c.json(await store.tasks.listByRequirement(id))
  })
  app.patch('/requirements/:id', async c => {
    const id = intParam(c.req.param('id'))
    const r = await loadScopedRequirement(c, store, id)
    if (r instanceof Response) return r
    const patch = (await c.req.json()) as RequirementPatch
    return c.json(await store.requirements.update(id, patch))
  })
  app.delete('/requirements/:id', async c => {
    const id = intParam(c.req.param('id'))
    const r = await loadScopedRequirement(c, store, id)
    if (r instanceof Response) return r
    await store.requirements.delete(id)
    return c.body(null, 204)
  })
}
