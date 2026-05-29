import type { Hono } from 'hono'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

export const registerWorkspaceRoutes = (app: Hono<AppEnv>, store: Store): void => {
  app.post('/workspaces', async c => {
    const body = (await c.req.json()) as { name?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    return c.json(await store.workspaces.create({ name: body.name }), 201)
  })
  app.get('/workspaces', async c => c.json(await store.workspaces.list()))
  app.get('/workspaces/:id', async c => {
    const w = await store.workspaces.get(intParam(c.req.param('id')))
    return w ? c.json(w) : c.json({ error: 'not found' }, 404)
  })
  app.get('/workspaces/:id/projects', async c =>
    c.json(await store.projects.listByWorkspace(intParam(c.req.param('id')))),
  )
  app.delete('/workspaces/:id', async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.workspaces.get(id))) return c.json({ error: 'not found' }, 404)
    await store.workspaces.delete(id)
    return c.body(null, 204)
  })
}
