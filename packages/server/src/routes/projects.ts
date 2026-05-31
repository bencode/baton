import type { Id } from '@baton/shared'
import type { Hono } from 'hono'
import type { BusyTracker } from '../busy.ts'
import type { LivenessTracker } from '../liveness.ts'
import type { SessionRuntime } from '../session-runtime.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam, sessionWithView, workerWithView } from '../views.ts'

export const registerProjectRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  workerLiveness: LivenessTracker,
  runtime: SessionRuntime,
  busyTracker: BusyTracker,
): void => {
  app.post('/projects', async c => {
    const body = (await c.req.json()) as {
      workspaceId?: Id
      name?: string
      description?: string
    }
    if (!body.workspaceId || !body.name)
      return c.json({ error: 'workspaceId and name required' }, 400)
    const { workspaceId, name, description } = body
    return c.json(await store.projects.create({ workspaceId, name, description }), 201)
  })
  app.get('/projects/:id', async c => {
    const p = await store.projects.get(intParam(c.req.param('id')))
    return p ? c.json(p) : c.json({ error: 'not found' }, 404)
  })
  app.get('/projects/:id/requirements', async c =>
    c.json(await store.requirements.listByProject(intParam(c.req.param('id')))),
  )
  app.get('/projects/:id/sessions', async c => {
    const id = intParam(c.req.param('id'))
    const list = await store.sessions.listByProject(id)
    const merged = await Promise.all(
      list.map(s => sessionWithView(s, store, workerLiveness, runtime, busyTracker)),
    )
    return c.json(merged)
  })
  app.get('/projects/:id/workers', async c => {
    const id = intParam(c.req.param('id'))
    const list = await store.workers.listByProject(id)
    return c.json(list.map(w => workerWithView(w, workerLiveness)))
  })
  // Resolve an item by its project-scoped code (R-N / T-N only). Sessions and
  // workers don't carry human codes — navigate to them by int id.
  app.get('/projects/:projectId/items/:code', async c => {
    const projectId = intParam(c.req.param('projectId'))
    const code = c.req.param('code')
    if (code.startsWith('R-')) {
      const r = await store.requirements.getByCode(projectId, code)
      return r ? c.json({ kind: 'requirement', item: r }) : c.json({ error: 'not found' }, 404)
    }
    if (code.startsWith('T-')) {
      const t = await store.tasks.getByCode(projectId, code)
      return t ? c.json({ kind: 'task', item: t }) : c.json({ error: 'not found' }, 404)
    }
    return c.json({ error: 'unknown code prefix' }, 400)
  })
  app.delete('/projects/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.projects.get(id))) return c.json({ error: 'not found' }, 404)
    await store.projects.delete(id)
    return c.body(null, 204)
  })
}
