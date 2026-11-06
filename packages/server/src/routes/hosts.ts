import type { AdminHost, HostCredential } from '@baton/shared'
import type { Hono, MiddlewareHandler } from 'hono'
import { requireAdmin } from '../middleware/domain-scope.ts'
import { type AppEnv, intParam, isUniqueViolation } from '../views.ts'
import type { ProvisioningDeps } from '../worker-provisioning/service.ts'

// Admin management of hosts: which machines exist and which workspaces may use
// them. Driven by `baton host`; there is no web page for it.
export const registerHostRoutes = (app: Hono<AppEnv>, { store, bus }: ProvisioningDeps): void => {
  const admin: MiddlewareHandler<AppEnv> = async (c, next) =>
    (await requireAdmin(c, store)) ?? next()

  app.post('/hosts', admin, async c => {
    const body = (await c.req.json()) as { name?: unknown }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return c.json({ error: 'name required' }, 400)
    try {
      return c.json<HostCredential>(await store.hosts.create({ name }), 201)
    } catch (error) {
      if (isUniqueViolation(error)) return c.json({ error: 'host name already in use' }, 409)
      throw error
    }
  })
  app.get('/hosts', admin, async c => {
    const hosts = await store.hosts.list()
    return c.json<AdminHost[]>(hosts.map(host => ({ ...host, online: bus.has(host.id) })))
  })
  app.post('/hosts/:id/token', admin, async c => {
    const id = intParam(c.req.param('id'))
    if (!(await store.hosts.get(id))) return c.json({ error: 'not found' }, 404)
    const credential = await store.hosts.rotateToken(id)
    bus.disconnect(id)
    return c.json<HostCredential>(credential)
  })
  app.put('/hosts/:id/workspaces/:workspaceId', admin, async c => {
    const id = intParam(c.req.param('id'))
    const workspaceId = intParam(c.req.param('workspaceId'))
    const [host, workspace] = await Promise.all([
      store.hosts.get(id),
      store.workspaces.get(workspaceId),
    ])
    if (!host || !workspace) return c.json({ error: 'not found' }, 404)
    await store.hosts.assign(id, workspaceId)
    return c.body(null, 204)
  })
  app.delete('/hosts/:id/workspaces/:workspaceId', admin, async c => {
    await store.hosts.unassign(intParam(c.req.param('id')), intParam(c.req.param('workspaceId')))
    return c.body(null, 204)
  })
}
