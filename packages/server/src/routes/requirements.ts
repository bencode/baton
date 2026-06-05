import type { ExternalRef, Id, RequirementStatus, ResourceRef } from '@baton/shared'
import type { Hono } from 'hono'
import type { RequirementPatch, Store } from '../store/types.ts'
import { type AppEnv, intParam, isExternalRef } from '../views.ts'

export const registerRequirementRoutes = (app: Hono<AppEnv>, store: Store): void => {
  app.post('/requirements', async c => {
    const reqBody = (await c.req.json()) as {
      projectId?: Id
      title?: string
      description?: string
      body?: string
      resources?: ResourceRef[]
      status?: RequirementStatus
      external?: ExternalRef
    }
    if (!reqBody.projectId || !reqBody.title)
      return c.json({ error: 'projectId and title required' }, 400)
    if (reqBody.external !== undefined && !isExternalRef(reqBody.external))
      return c.json({ error: 'invalid external ref (need source=github + integer number)' }, 400)
    const { projectId, title, description, body, resources, status, external } = reqBody
    return c.json(
      await store.requirements.create({
        projectId,
        title,
        description,
        body,
        resources,
        status,
        external,
      }),
      201,
    )
  })
  app.get('/requirements/:id', async c => {
    const r = await store.requirements.get(intParam(c.req.param('id')))
    return r ? c.json(r) : c.json({ error: 'not found' }, 404)
  })
  app.get('/requirements/:id/full', async c => {
    const full = await store.getRequirementWithTasks(intParam(c.req.param('id')))
    return full ? c.json(full) : c.json({ error: 'not found' }, 404)
  })
  app.get('/requirements/:id/tasks', async c =>
    c.json(await store.tasks.listByRequirement(intParam(c.req.param('id')))),
  )
  app.patch('/requirements/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.requirements.get(id))) return c.json({ error: 'not found' }, 404)
    const patch = (await c.req.json()) as RequirementPatch
    // external: undefined = untouched, null = unlink, otherwise must validate
    if (patch.external != null && !isExternalRef(patch.external))
      return c.json({ error: 'invalid external ref (need source=github + integer number)' }, 400)
    return c.json(await store.requirements.update(id, patch))
  })
  app.delete('/requirements/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.requirements.get(id))) return c.json({ error: 'not found' }, 404)
    await store.requirements.delete(id)
    return c.body(null, 204)
  })
}
