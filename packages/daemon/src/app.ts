import type { RequirementStatus, ResourceRef, TaskStatus } from '@baton/shared'
import { Hono } from 'hono'
import type { Store } from './store/types.ts'

// Minimal core HTTP surface: a thin layer over Store (connection/claim land in M2).
export const createApp = (store: Store): Hono => {
  const app = new Hono()

  app.get('/health', c => c.json({ ok: true }))

  app.post('/workspaces', async c => {
    const body = (await c.req.json()) as { name?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    return c.json(await store.workspaces.create({ name: body.name }), 201)
  })
  app.get('/workspaces', async c => c.json(await store.workspaces.list()))
  app.get('/workspaces/:id', async c => {
    const w = await store.workspaces.get(c.req.param('id'))
    return w ? c.json(w) : c.json({ error: 'not found' }, 404)
  })
  app.get('/workspaces/:id/projects', async c =>
    c.json(await store.projects.listByWorkspace(c.req.param('id'))),
  )

  app.post('/projects', async c => {
    const body = (await c.req.json()) as {
      workspaceId?: string
      name?: string
      description?: string
    }
    if (!body.workspaceId || !body.name)
      return c.json({ error: 'workspaceId and name required' }, 400)
    const { workspaceId, name, description } = body
    return c.json(await store.projects.create({ workspaceId, name, description }), 201)
  })
  app.get('/projects/:id', async c => {
    const p = await store.projects.get(c.req.param('id'))
    return p ? c.json(p) : c.json({ error: 'not found' }, 404)
  })
  app.get('/projects/:id/requirements', async c =>
    c.json(await store.requirements.listByProject(c.req.param('id'))),
  )

  app.post('/requirements', async c => {
    const body = (await c.req.json()) as {
      projectId?: string
      title?: string
      description?: string
      resources?: ResourceRef[]
      tags?: string[]
      status?: RequirementStatus
    }
    if (!body.projectId || !body.title)
      return c.json({ error: 'projectId and title required' }, 400)
    const { projectId, title, description, resources, tags, status } = body
    return c.json(
      await store.requirements.create({ projectId, title, description, resources, tags, status }),
      201,
    )
  })
  app.get('/requirements/:id', async c => {
    const r = await store.requirements.get(c.req.param('id'))
    return r ? c.json(r) : c.json({ error: 'not found' }, 404)
  })
  app.get('/requirements/:id/full', async c => {
    const full = await store.getRequirementWithTasks(c.req.param('id'))
    return full ? c.json(full) : c.json({ error: 'not found' }, 404)
  })
  app.get('/requirements/:id/tasks', async c =>
    c.json(await store.tasks.listByRequirement(c.req.param('id'))),
  )

  app.post('/tasks', async c => {
    const body = (await c.req.json()) as {
      requirementId?: string
      title?: string
      spec?: string
      requires?: string[]
      dependsOn?: string[]
      status?: TaskStatus
    }
    if (!body.requirementId || !body.title)
      return c.json({ error: 'requirementId and title required' }, 400)
    const { requirementId, title, spec, requires, dependsOn, status } = body
    return c.json(
      await store.tasks.create({ requirementId, title, spec, requires, dependsOn, status }),
      201,
    )
  })
  app.get('/tasks/:id', async c => {
    const t = await store.tasks.get(c.req.param('id'))
    return t ? c.json(t) : c.json({ error: 'not found' }, 404)
  })

  return app
}
