import type { Id, TaskStatus } from '@baton/shared'
import type { Hono } from 'hono'
import type { ProjectBus } from '../project-bus.ts'
import type { Store, TaskPatch } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

export const registerTaskRoutes = (app: Hono<AppEnv>, store: Store, projects: ProjectBus): void => {
  app.post('/tasks', async c => {
    const reqBody = (await c.req.json()) as {
      requirementId?: Id
      title?: string
      body?: string
      dependsOn?: Id[]
      status?: TaskStatus
    }
    if (!reqBody.requirementId || !reqBody.title)
      return c.json({ error: 'requirementId and title required' }, 400)
    const { requirementId, title, body, dependsOn, status } = reqBody
    return c.json(await store.tasks.create({ requirementId, title, body, dependsOn, status }), 201)
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
  // Append-only comments. List in insertion order; create one at a time. Like
  // the other task routes this is public in v0 — workerId is a soft attribution
  // hint (null = a human via UI). A new comment bumps the project stream so open
  // clients refetch (no bespoke SSE; reuses the { resource: 'tasks' } signal).
  app.get('/tasks/:id/comments', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.tasks.get(id))) return c.json({ error: 'not found' }, 404)
    return c.json(await store.taskComments.listByTask(id))
  })
  app.post('/tasks/:id/comments', async c => {
    const id = intParam(c.req.param('id'))
    const task = await store.tasks.get(id)
    if (!task) return c.json({ error: 'not found' }, 404)
    const input = (await c.req.json()) as { body?: string; workerId?: Id }
    if (!input.body) return c.json({ error: 'body required' }, 400)
    const comment = await store.taskComments.create({
      taskId: id,
      body: input.body,
      workerId: input.workerId,
    })
    projects.publish(task.projectId, { resource: 'tasks' })
    return c.json(comment, 201)
  })
}
