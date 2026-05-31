import type { Id, RequirementStatus, ResourceRef } from '@baton/shared'
import type { Hono } from 'hono'
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
    return c.json(
      await store.requirements.create({ projectId, title, description, body, resources, status }),
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
    return c.json(await store.requirements.update(id, (await c.req.json()) as RequirementPatch))
  })
  app.delete('/requirements/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.requirements.get(id))) return c.json({ error: 'not found' }, 404)
    await store.requirements.delete(id)
    return c.body(null, 204)
  })
}
