import type { Id, TaskStatus } from '@baton/shared'
import type { Hono } from 'hono'
import type { Store, TaskPatch } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

export const registerTaskRoutes = (app: Hono<AppEnv>, store: Store): void => {
  app.post('/tasks', async c => {
    const body = (await c.req.json()) as {
      requirementId?: Id
      title?: string
      spec?: string
      dependsOn?: Id[]
      status?: TaskStatus
    }
    if (!body.requirementId || !body.title)
      return c.json({ error: 'requirementId and title required' }, 400)
    const { requirementId, title, spec, dependsOn, status } = body
    return c.json(await store.tasks.create({ requirementId, title, spec, dependsOn, status }), 201)
  })
  app.get('/tasks/:id', async c => {
    const t = await store.tasks.get(intParam(c.req.param('id')))
    return t ? c.json(t) : c.json({ error: 'not found' }, 404)
  })
  app.patch('/tasks/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.tasks.get(id))) return c.json({ error: 'not found' }, 404)
    return c.json(await store.tasks.update(id, (await c.req.json()) as TaskPatch))
  })
  app.delete('/tasks/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.tasks.get(id))) return c.json({ error: 'not found' }, 404)
    await store.tasks.delete(id)
    return c.body(null, 204)
  })
}
