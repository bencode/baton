import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../views.ts'

export const provisionerAuth =
  (token?: string): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!token) return c.json({ error: 'mini provisioner is not configured' }, 503)
    const bearer = (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)?.[1] ?? ''
    const actual = Buffer.from(bearer)
    const expected = Buffer.from(token)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return c.json({ error: 'unauthorized' }, 401)
    await next()
  }
