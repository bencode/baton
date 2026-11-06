import type { MiddlewareHandler } from 'hono'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'

// The bearer token says which host is calling; every provisioner route acts for
// that host alone.
export const provisionerAuth =
  (store: Store): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const bearer = (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)?.[1]
    const host = bearer ? await store.hosts.getByToken(bearer) : null
    if (!host) return c.json({ error: 'unauthorized' }, 401)
    c.set('hostId', host.id)
    await next()
  }
