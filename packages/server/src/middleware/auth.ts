import type { Session } from '@baton/shared'
import type { MiddlewareHandler } from 'hono'
import type { Store } from '../store/types.ts'

// Variables a bearer-authenticated route handler can read via c.get('session').
export type AuthVars = { session: Session }

// Resolves the bearer token to a Session and rejects if missing / closed.
// Mounted on /sessions/me/*.
export const bearerAuth = (store: Store): MiddlewareHandler<{ Variables: AuthVars }> => {
  return async (c, next) => {
    const m = (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)
    const token = m?.[1]
    if (!token) return c.json({ error: 'unauthorized' }, 401)
    const session = await store.sessions.getByToken(token)
    if (!session || session.state === 'closed') return c.json({ error: 'unauthorized' }, 401)
    c.set('session', session)
    await next()
  }
}
