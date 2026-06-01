import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { hashPassword } from '../auth/password.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, seedSession } from './test-helpers.ts'

// Pull the `baton_session=...` pair out of a Set-Cookie header for replay.
const cookieFrom = (res: Response): string =>
  (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''

describe('server HTTP — cookie auth gate', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('gate is OFF until a user exists, then requires a valid cookie', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)

    // No users yet → protected routes are open (dev / CLI / bridge keep working).
    assert.equal((await app.request('/workspaces')).status, 200)

    // Seeding a user flips enforcement on.
    await ctx.store.users.create({ username: 'admin', passwordHash: hashPassword('pw') })
    assert.equal((await app.request('/workspaces')).status, 401)

    // Wrong password → 401, no cookie.
    assert.equal(
      (await postJson(app, '/auth/login', { username: 'admin', password: 'x' })).status,
      401,
    )

    // Correct login → 200 + Set-Cookie; the cookie then unlocks the back-office.
    const login = await postJson(app, '/auth/login', { username: 'admin', password: 'pw' })
    assert.equal(login.status, 200)
    const cookie = cookieFrom(login)
    assert.ok(cookie.startsWith('baton_session='))
    const me = await app.request('/auth/me', { headers: { cookie } })
    assert.equal(me.status, 200)
    assert.equal(((await me.json()) as { user: { username: string } }).user.username, 'admin')
    assert.equal((await app.request('/workspaces', { headers: { cookie } })).status, 200)
    // No cookie / bad cookie still rejected.
    assert.equal((await app.request('/auth/me')).status, 401)

    // Worker-bearer route stays exempt even with auth on (no cookie, just Bearer).
    const status = await postJson(
      app,
      `/sessions/${session.id}/status`,
      { active: true },
      { authorization: `Bearer ${workerToken}` },
    )
    assert.equal(status.status, 200)

    // Worker Bearer also passes a GATED (non-exempt) read route — the daemon's
    // reconcile reads (GET /sessions/:id, /projects/:id/sessions) rely on this.
    const read = await app.request(`/sessions/${session.id}`, {
      headers: { authorization: `Bearer ${workerToken}` },
    })
    assert.equal(read.status, 200)
  })

  test('share-token login: 200 + cookie on a valid token, 404 on garbage', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    await ctx.store.users.create({ username: 'admin', passwordHash: hashPassword('pw') })
    const full = (await (
      await app.request(`/sessions/${session.id}`, {
        headers: {
          cookie: cookieFrom(
            await postJson(app, '/auth/login', { username: 'admin', password: 'pw' }),
          ),
        },
      })
    ).json()) as { shareToken: string }

    const bad = await postJson(app, '/auth/share/not-a-real-token', {})
    assert.equal(bad.status, 404)

    const ok = await postJson(app, `/auth/share/${full.shareToken}`, {})
    assert.equal(ok.status, 200)
    assert.equal(((await ok.json()) as { session: { id: number } }).session.id, session.id)
    // the share login minted a session cookie → the standalone page is now authed
    assert.equal(
      (await app.request('/workspaces', { headers: { cookie: cookieFrom(ok) } })).status,
      200,
    )
  })
})
