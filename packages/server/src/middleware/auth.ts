import type { Session } from '@baton/shared'
import type { Context, MiddlewareHandler } from 'hono'
import type { Store } from '../store/types.ts'

// Variables a bearer-authenticated route handler can read via c.get('session').
export type AuthVars = { session: Session }

// Resolves the bearer token to a Session and rejects if missing / closed.
// Routes mount this on /sessions/me/* and the assignment progress endpoints.
export const bearerAuth = (store: Store): MiddlewareHandler<{ Variables: AuthVars }> => {
  return async (c, next) => {
    const m = (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)
    const token = m?.[1]
    if (!token) return c.json({ error: 'unauthorized' }, 401)
    const session = await store.sessions.getByToken(token)
    if (!session || session.status === 'closed') return c.json({ error: 'unauthorized' }, 401)
    c.set('session', session)
    await next()
  }
}

// Helper for assignment routes: enforce that the bearer Session owns the assignment.
// Returns null on success; a Response on failure (caller `return`s it directly).
export const requireOwnership = async (
  c: Context<{ Variables: AuthVars }>,
  store: Store,
  assignmentId: number,
): Promise<Response | { sessionId: number; taskId: number } | null> => {
  const a = await store.assignments.get(assignmentId)
  if (!a) return c.json({ error: 'not found' }, 404)
  const session = c.get('session')
  if (a.sessionId !== session.id) return c.json({ error: 'forbidden' }, 403)
  return { sessionId: a.sessionId, taskId: a.taskId }
}
