import type { Worker } from '@baton/shared'
import type { MiddlewareHandler } from 'hono'
import type { Store } from '../store/types.ts'

// Variables a worker-authenticated route handler can read via c.get('worker').
export type AuthVars = { worker: Worker }

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
