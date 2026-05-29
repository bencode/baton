import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, seedSession } from './test-helpers.ts'

describe('server HTTP — sessions + chat protocol', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('session register: returns int id + apiToken + view fields (alive/attached/busy)', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    assert.equal(typeof session.id, 'number')
    assert.equal(typeof session.apiToken, 'string')
    assert.equal(session.busy, false)
    // alive is true: worker register seeds worker liveness with its first ping.
    assert.equal(session.alive, true)
    // attached is false: no daemon has pinged /sessions/me/heartbeat yet.
    assert.equal(session.attached, false)
  })

  test('attached flips to true after POST /sessions/me/heartbeat', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    let view = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      attached: boolean
    }
    assert.equal(view.attached, false)
    const hb = await postJson(
      app,
      '/sessions/me/heartbeat',
      {},
      { authorization: `Bearer ${session.apiToken}` },
    )
    assert.equal(hb.status, 200)
    assert.deepEqual(await hb.json(), { attached: true })
    view = (await (await app.request(`/sessions/${session.id}`)).json()) as { attached: boolean }
    assert.equal(view.attached, true)
    assert.equal((await postJson(app, '/sessions/me/heartbeat', {})).status, 401)
  })

  test('messages: POST /sessions/:id/messages synthesizes ephemeral user_message', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const res = await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })
    assert.equal(res.status, 201)
    const ev = (await res.json()) as { type: string; sequence: number; payload: { text: string } }
    assert.equal(ev.type, 'user_message')
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

  test('messages: accepts pasted images (data URLs), rejects empty and oversized', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
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
    const { session } = await seedSession(app)
    const auth = { authorization: `Bearer ${session.apiToken}` }

    // Unauthorized rejected.
    assert.equal(
      (await postJson(app, '/sessions/me/events', { type: 'sdk_event', payload: {} })).status,
      401,
    )

    // Heartbeat first (real daemon order). Without it attached=false → busy=false.
    await postJson(app, '/sessions/me/heartbeat', {}, auth)

    // turn_start → busy=true.
    await postJson(app, '/sessions/me/events', { type: 'turn_start', payload: {} }, auth)
    const busy = (await (await app.request(`/sessions/${session.id}`)).json()) as { busy: boolean }
    assert.equal(busy.busy, true)

    // sdk_event in between does not change busy.
    await postJson(app, '/sessions/me/events', { type: 'sdk_event', payload: {} }, auth)
    const stillBusy = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      busy: boolean
    }
    assert.equal(stillBusy.busy, true)

    // turn_complete → busy=false.
    await postJson(
      app,
      '/sessions/me/events',
      { type: 'turn_complete', payload: { exitCode: 0 } },
      auth,
    )
    const idle = (await (await app.request(`/sessions/${session.id}`)).json()) as { busy: boolean }
    assert.equal(idle.busy, false)
  })

  test('busy=false when daemon never heartbeated (orphan turn_start, sticky-yellow fix)', async () => {
    // Daemon emitted turn_start without ever sending the session heartbeat:
    // attached=false → busy collapses to false regardless of busyTracker.
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const auth = { authorization: `Bearer ${session.apiToken}` }
    await postJson(app, '/sessions/me/events', { type: 'turn_start', payload: {} }, auth)
    const view = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      attached: boolean
      busy: boolean
    }
    assert.equal(view.attached, false)
    assert.equal(view.busy, false)
  })
})
