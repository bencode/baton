import type { MiddlewareHandler } from 'hono'
import { getSignedCookie } from 'hono/cookie'
import { authSecret, COOKIE_NAME } from '../auth/config.ts'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'

// Paths that bypass the cookie gate. /health and /auth/* are public; the rest
// are machine-client routes that carry their own Bearer token (worker daemon) or
// must stay open for registration/heartbeat. Matched on method+path so a
// worker's PATCH /sessions/:id passes while a user's POST /sessions/:id/messages
// is gated.
const isExempt = (method: string, path: string): boolean =>
  path === '/health' ||
  path.startsWith('/auth/') ||
  path === '/workers/me/stream' ||
  (method === 'POST' && (path === '/workers' || path === '/workers/heartbeat')) ||
  (method === 'PATCH' && /^\/sessions\/[^/]+$/.test(path)) ||
  (method === 'POST' && /^\/sessions\/[^/]+\/(status|events)$/.test(path))

// The one back-office auth gate. Enforced ONLY when at least one user exists:
// seed a user → production locks down; an empty table (dev, fresh DB) leaves the
// API open so the CLI / bridge / worker keep working unchanged. A valid signed
// cookie authenticates; anything else is 401.
export const cookieAuth =
  (store: Store): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (isExempt(c.req.method, c.req.path)) return next()
    if ((await store.users.count()) === 0) return next()
    const raw = await getSignedCookie(c, authSecret(), COOKIE_NAME)
    const userId = raw ? Number(raw) : Number.NaN
    if (raw && !Number.isNaN(userId)) {
      c.set('userId', userId)
      return next()
    }
    // The worker daemon / session child authenticate as a machine principal with
    // their Bearer token (reads + the EventSource stream, which can't carry a
    // cookie). Worker-write routes still re-check ownership via workerBearerAuth.
    const bearer = (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)?.[1]
    if (bearer && (await store.workers.getByToken(bearer))) return next()
    return c.json({ error: 'unauthorized' }, 401)
  }
