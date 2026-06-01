import type { Id, Worker } from '@baton/shared'
import type { MiddlewareHandler } from 'hono'
import type { Store } from '../store/types.ts'

// Variables auth middleware sets: `worker` on worker-bearer routes (c.get),
// `userId` on cookie-authed back-office routes (set by the cookie gate).
export type AuthVars = { worker: Worker; userId?: Id }

// Resolves the bearer token to a Worker and rejects if missing. Every session
// is worker-created, so the worker token is the single credential for all
// session writes (events / heartbeat / materialize); the handler verifies the
// worker actually owns the session it's acting on.
export const workerBearerAuth = (store: Store): MiddlewareHandler<{ Variables: AuthVars }> => {
  return async (c, next) => {
    const m = (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)
    const token = m?.[1]
    if (!token) return c.json({ error: 'unauthorized' }, 401)
    const worker = await store.workers.getByToken(token)
    if (!worker) return c.json({ error: 'unauthorized' }, 401)
    c.set('worker', worker)
    await next()
  }
}
