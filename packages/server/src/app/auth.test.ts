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

    // A user's personal API token also authenticates (the bridge / CLI use it).
    const u = await ctx.store.users.getByUsername('admin')
    await ctx.store.users.setApiToken(u?.id ?? 0, 'tok-abc123')
    assert.equal(
      (await app.request('/workspaces', { headers: { authorization: 'Bearer tok-abc123' } }))
        .status,
      200,
    )
    // a bogus bearer is still rejected
    assert.equal(
      (await app.request('/workspaces', { headers: { authorization: 'Bearer nope' } })).status,
      401,
    )
  })

  test('share-token login: 200 + cookie on a valid token, 404 on garbage', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    await ctx.store.users.create({
      username: 'admin',
      passwordHash: hashPassword('pw'),
      isAdmin: true,
    })
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

  test('self-service: change password + mint personal API token', async () => {
    const app = createApp(ctx.store)
    await ctx.store.users.create({
      username: 'alice',
      passwordHash: hashPassword('pw1'),
      isAdmin: true,
    })
    const cookie = cookieFrom(
      await postJson(app, '/auth/login', { username: 'alice', password: 'pw1' }),
    )

    // /auth/me reports hasToken:false before minting one.
    const me0 = (await (await app.request('/auth/me', { headers: { cookie } })).json()) as {
      hasToken: boolean
    }
    assert.equal(me0.hasToken, false)

    // Change password: wrong old → 401; right old → 200; the old password then fails.
    assert.equal(
      (await postJson(app, '/auth/password', { oldPassword: 'no', newPassword: 'pw2' }, { cookie }))
        .status,
      401,
    )
    assert.equal(
      (
        await postJson(
          app,
          '/auth/password',
          { oldPassword: 'pw1', newPassword: 'pw2' },
          { cookie },
        )
      ).status,
      200,
    )
    assert.equal(
      (await postJson(app, '/auth/login', { username: 'alice', password: 'pw1' })).status,
      401,
    )
    assert.equal(
      (await postJson(app, '/auth/login', { username: 'alice', password: 'pw2' })).status,
      200,
    )

    // Mint a personal API token → it authenticates as the user; /auth/me flips hasToken.
    const minted = (await (await postJson(app, '/auth/token', {}, { cookie })).json()) as {
      token: string
    }
    assert.ok(minted.token)
    assert.equal(
      (
        await app.request('/workspaces', {
          headers: { authorization: `Bearer ${minted.token}` },
        })
      ).status,
      200,
    )
    const me1 = (await (await app.request('/auth/me', { headers: { cookie } })).json()) as {
      hasToken: boolean
    }
    assert.equal(me1.hasToken, true)

    // Both endpoints require auth (no cookie / token → 401).
    assert.equal((await postJson(app, '/auth/token', {})).status, 401)
    assert.equal(
      (await postJson(app, '/auth/password', { oldPassword: 'pw2', newPassword: 'pw3' })).status,
      401,
    )
  })
})
