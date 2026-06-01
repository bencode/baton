import type { User } from '@baton/shared'
import type { Context, Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { authSecret, COOKIE_MAX_AGE, COOKIE_NAME, cookieSecure } from '../auth/config.ts'
import { verifyPassword } from '../auth/password.ts'
import type { Store, UserRecord } from '../store/types.ts'
import type { AppEnv } from '../views.ts'

// Strip the password hash before anything leaves the server.
const toView = (u: UserRecord): User => ({ id: u.id, username: u.username, createdAt: u.createdAt })

const setSession = (c: Context<AppEnv>, userId: number): Promise<void> =>
  setSignedCookie(c, COOKIE_NAME, String(userId), authSecret(), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: cookieSecure(),
    maxAge: COOKIE_MAX_AGE,
  })

// Auth endpoints — the only way to mint the session cookie. Registered before
// the cookie gate and exempt from it. Both a password login and a share-token
// open mint the SAME cookie; every other route then just checks "valid cookie?".
export const registerAuthRoutes = (app: Hono<AppEnv>, store: Store): void => {
  app.post('/auth/login', async c => {
    const { username, password } = await c.req
      .json<{ username?: string; password?: string }>()
      .catch(() => ({ username: undefined, password: undefined }))
    if (!username || !password) return c.json({ error: 'bad request' }, 400)
    const user = await store.users.getByUsername(username)
    if (!user || !verifyPassword(password, user.passwordHash))
      return c.json({ error: 'invalid credentials' }, 401)
    await setSession(c, user.id)
    return c.json({ user: toView(user) })
  })

  app.post('/auth/logout', c => {
    deleteCookie(c, COOKIE_NAME, { path: '/' })
    return c.json({ ok: true })
  })

  // Drives the web auth gate. When no users are seeded auth is OFF — 200 with
  // authRequired:false so the gate lets the (open) back-office through. When auth
  // is on: 200 {user} for a valid cookie, else 401 (gate → /login).
  app.get('/auth/me', async c => {
    const required = (await store.users.count()) > 0
    const raw = await getSignedCookie(c, authSecret(), COOKIE_NAME)
    const user = raw ? await store.users.get(Number(raw)) : null
    if (!required) return c.json({ authRequired: false, user: user ? toView(user) : null })
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    return c.json({ authRequired: true, user: toView(user) })
  })

  // Standalone-page auto-login: a valid share token logs the browser in as the
  // (single, v0) seeded user — full access, so the share page is the unmodified
  // detail page. 404 if the token matches nothing. With no users seeded (dev),
  // auth is off anyway; we still return the session so the page can render.
  app.post('/auth/share/:token', async c => {
    const session = await store.sessions.getByShareToken(c.req.param('token'))
    if (!session) return c.json({ error: 'not found' }, 404)
    const user = await store.users.first()
    if (user) await setSession(c, user.id)
    return c.json({ session })
  })
}
