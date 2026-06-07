import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, seedSession, seedWorker } from './test-helpers.ts'

describe('server HTTP — sessions + chat protocol', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('session create: returns int id + view fields; agentSessionId/worktreePath null', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    assert.equal(typeof session.id, 'number')
    assert.equal(session.busy, false)
    // alive is true: worker register seeds worker liveness with its first ping.
    assert.equal(session.alive, true)
    // attached is false: the worker hasn't reported a running child yet.
    assert.equal(session.attached, false)
    const full = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      agentSessionId: string | null
      worktreePath: string | null
    }
    assert.equal(full.agentSessionId, null)
    assert.equal(full.worktreePath, null)
  })

  test('materialize (PATCH) + status report flips attached (worker-bearer)', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    const auth = { authorization: `Bearer ${workerToken}` }

    const patched = await app.request(`/sessions/${session.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ agentSessionId: 'uuid-1', worktreePath: '/tmp/wt' }),
      headers: { 'content-type': 'application/json', ...auth },
    })
    assert.equal(patched.status, 200)
    const pv = (await patched.json()) as { agentSessionId: string; worktreePath: string }
    assert.equal(pv.agentSessionId, 'uuid-1')
    assert.equal(pv.worktreePath, '/tmp/wt')

    // worker reports child up → attached true; down → attached false.
    await postJson(app, `/sessions/${session.id}/status`, { active: true }, auth)
    let view = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      attached: boolean
    }
    assert.equal(view.attached, true)
    await postJson(app, `/sessions/${session.id}/status`, { active: false }, auth)
    view = (await (await app.request(`/sessions/${session.id}`)).json()) as { attached: boolean }
    assert.equal(view.attached, false)
    // unauthenticated status rejected
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/status`, { active: true })).status,
      401,
    )
  })

  test('clear: regenerates agentSessionId, keeps worktree, appends a context_cleared notice', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    const auth = { authorization: `Bearer ${workerToken}` }
    await app.request(`/sessions/${session.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ agentSessionId: 'uuid-1', worktreePath: '/tmp/wt' }),
      headers: { 'content-type': 'application/json', ...auth },
    })

    const res = await postJson(app, `/sessions/${session.id}/clear`, {})
    assert.equal(res.status, 200)
    const cleared = (await res.json()) as { agentSessionId: string; worktreePath: string }
    assert.notEqual(cleared.agentSessionId, 'uuid-1') // a fresh claude conversation
    assert.equal(cleared.worktreePath, '/tmp/wt') // code in the worktree is kept

    const events = (await (await app.request(`/sessions/${session.id}/events`)).json()) as {
      type: string
      payload: { action?: string } | null
    }[]
    assert.ok(
      events.some(e => e.type === 'system' && e.payload?.action === 'context_cleared'),
      'a context_cleared system event was appended',
    )
  })

  test('messages require an active session (409 when inactive)', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    const auth = { authorization: `Bearer ${workerToken}` }
    // inactive → 409
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })).status,
      409,
    )
    // activate → 201
    await postJson(app, `/sessions/${session.id}/status`, { active: true }, auth)
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })).status,
      201,
    )
    // stop (worker reports inactive) → 409 again
    await postJson(app, `/sessions/${session.id}/status`, { active: false }, auth)
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })).status,
      409,
    )
  })

  test('messages: POST /sessions/:id/messages persists a user_message (per-session sequence)', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    await postJson(
      app,
      `/sessions/${session.id}/status`,
      { active: true },
      {
        authorization: `Bearer ${workerToken}`,
      },
    )
    const res = await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })
    assert.equal(res.status, 201)
    const ev = (await res.json()) as { type: string; sequence: number; payload: { text: string } }
    assert.equal(ev.type, 'user_message')
    // Persisted now → sequence is the per-session 0-based position (fresh db).
    assert.equal(ev.sequence, 0)
    assert.equal(ev.payload.text, 'hi')

    // 400 on empty text + images
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { text: '' })).status,
      400,
    )

    // destroy session → next message gets 404
    await app.request(`/sessions/${session.id}`, { method: 'DELETE' })
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })).status,
      404,
    )
  })

  test('messages are persisted + replayable via GET history (store-backed)', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    await postJson(
      app,
      `/sessions/${session.id}/status`,
      { active: true },
      { authorization: `Bearer ${workerToken}` },
    )
    await postJson(app, `/sessions/${session.id}/messages`, { text: 'one' })
    await postJson(app, `/sessions/${session.id}/messages`, { text: 'two' })
    // The transcript is now persisted server-side (not browser-only): the store
    // holds both in order — what the stream replays on (re)connect.
    const events = await ctx.store.sessions.listEvents(session.id)
    const texts = events
      .filter(e => e.type === 'user_message')
      .map(e => (e.payload as { text: string }).text)
    assert.deepEqual(texts, ['one', 'two'])
    assert.deepEqual(
      events.filter(e => e.type === 'user_message').map(e => e.sequence),
      [0, 1],
    )

    // GET history endpoint returns the same persisted list (the web loads this
    // once instead of replaying over SSE). 404 for an unknown session.
    const res = await app.request(`/sessions/${session.id}/events`)
    assert.equal(res.status, 200)
    const got = (await res.json()) as Array<{ type: string; payload: { text?: string } }>
    assert.deepEqual(
      got.filter(e => e.type === 'user_message').map(e => e.payload.text),
      ['one', 'two'],
    )

    // ?since=<seq> bounds the history to events at/after a sequence — the web
    // uses this to backfill only the gap after an SSE reconnect. 'two' is at
    // sequence 1, so since=1 drops 'one' (sequence 0).
    const sinceRes = await app.request(`/sessions/${session.id}/events?since=1`)
    assert.equal(sinceRes.status, 200)
    const sinceGot = (await sinceRes.json()) as Array<{ type: string; payload: { text?: string } }>
    assert.deepEqual(
      sinceGot.filter(e => e.type === 'user_message').map(e => e.payload.text),
      ['two'],
    )
    assert.equal((await app.request('/sessions/999999/events')).status, 404)
  })

  test('share token: POST /auth/share/:token resolves the session, 404 on bad token', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const full = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      shareToken: string
    }
    assert.ok(full.shareToken)
    // good token → the session (the standalone page renders it with the normal api)
    const ok = await postJson(app, `/auth/share/${full.shareToken}`, {})
    assert.equal(ok.status, 200)
    assert.equal(((await ok.json()) as { session: { id: number } }).session.id, session.id)
    // guessed/garbage token → 404
    assert.equal((await postJson(app, '/auth/share/not-a-real-token', {})).status, 404)
  })

  test('messages: accepts pasted images (data URLs), rejects empty and oversized', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    await postJson(
      app,
      `/sessions/${session.id}/status`,
      { active: true },
      {
        authorization: `Bearer ${workerToken}`,
      },
    )
    const img = 'data:image/png;base64,AAAA'

    const res = await postJson(app, `/sessions/${session.id}/messages`, { text: '', images: [img] })
    assert.equal(res.status, 201)
    const ev = (await res.json()) as { type: string; payload: { text: string; images: string[] } }
    assert.equal(ev.type, 'user_message')
    assert.deepEqual(ev.payload.images, [img])

    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { images: [] })).status,
      400,
    )

    const huge = `data:image/png;base64,${'A'.repeat(8_000_001)}`
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { images: [huge] })).status,
      413,
    )
  })

  test('busy is driven by busyTracker via turn_start/turn_complete events', async () => {
    // Events are not persisted server-side anymore. busy comes from busyTracker,
    // which is toggled on turn_start (true) and turn_complete/error (false).
    // Still requires attached=true so a SIGKILL'd daemon (heartbeat stops) falls
    // back to busy=false within the 90s liveness window.
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    const auth = { authorization: `Bearer ${workerToken}` }

    // Unauthorized rejected.
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/events`, { type: 'sdk_event', payload: {} }))
        .status,
      401,
    )

    // Report active first (real worker order). Without it attached=false → busy=false.
    await postJson(app, `/sessions/${session.id}/status`, { active: true }, auth)

    // turn_start → busy=true.
    await postJson(app, `/sessions/${session.id}/events`, { type: 'turn_start', payload: {} }, auth)
    const busy = (await (await app.request(`/sessions/${session.id}`)).json()) as { busy: boolean }
    assert.equal(busy.busy, true)

    // sdk_event in between does not change busy.
    await postJson(app, `/sessions/${session.id}/events`, { type: 'sdk_event', payload: {} }, auth)
    const stillBusy = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      busy: boolean
    }
    assert.equal(stillBusy.busy, true)

    // turn_complete → busy=false.
    await postJson(
      app,
      `/sessions/${session.id}/events`,
      { type: 'turn_complete', payload: { exitCode: 0 } },
      auth,
    )
    const idle = (await (await app.request(`/sessions/${session.id}`)).json()) as { busy: boolean }
    assert.equal(idle.busy, false)
  })

  test('rename: nameless auto-titles while unlocked; human rename locks against auto-title', async () => {
    const app = createApp(ctx.store)
    const { projectId, workerId, workerToken } = await seedWorker(app)
    const auth = { authorization: `Bearer ${workerToken}` }
    const patchName = (id: number, name: string) =>
      app.request(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
        headers: { 'content-type': 'application/json', ...auth },
      })
    const nameOf = async (id: number) =>
      ((await (await app.request(`/sessions/${id}`)).json()) as { name: string }).name

    // Nameless create → `session-<id>` placeholder, unlocked.
    const s = (await (await postJson(app, '/sessions', { projectId, workerId })).json()) as {
      id: number
      name: string
    }
    assert.match(s.name, /^session-\d+$/)

    // Worker auto-title (PATCH name) applies while unlocked.
    await patchName(s.id, 'Auto Title')
    assert.equal(await nameOf(s.id), 'Auto Title')

    // Blank human rename → 400.
    assert.equal((await postJson(app, `/sessions/${s.id}/rename`, { name: ' ' })).status, 400)

    // Human rename → 200 + locks the name.
    const renamed = await postJson(app, `/sessions/${s.id}/rename`, { name: 'Human Name' })
    assert.equal(renamed.status, 200)
    assert.equal(((await renamed.json()) as { name: string }).name, 'Human Name')

    // Subsequent worker auto-title is suppressed — human wins.
    await patchName(s.id, 'Later Auto')
    assert.equal(await nameOf(s.id), 'Human Name')

    // Missing session → 404.
    await app.request(`/sessions/${s.id}`, { method: 'DELETE' })
    assert.equal((await postJson(app, `/sessions/${s.id}/rename`, { name: 'x' })).status, 404)
  })

  test('busy=false when daemon never heartbeated (orphan turn_start, sticky-yellow fix)', async () => {
    // Daemon emitted turn_start without ever sending the session heartbeat:
    // attached=false → busy collapses to false regardless of busyTracker.
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    const auth = { authorization: `Bearer ${workerToken}` }
    await postJson(app, `/sessions/${session.id}/events`, { type: 'turn_start', payload: {} }, auth)
    const view = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      attached: boolean
      busy: boolean
    }
    assert.equal(view.attached, false)
    assert.equal(view.busy, false)
  })
})
