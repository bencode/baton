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
    // Before heartbeat: attached=false.
    let view = (await (await app.request(`/sessions/${session.id}`)).json()) as {
      attached: boolean
    }
    assert.equal(view.attached, false)
    // Daemon pings session-level liveness.
    const hb = await postJson(
      app,
      '/sessions/me/heartbeat',
      {},
      { authorization: `Bearer ${session.apiToken}` },
    )
    assert.equal(hb.status, 200)
    assert.deepEqual(await hb.json(), { attached: true })
    // After heartbeat: attached=true.
    view = (await (await app.request(`/sessions/${session.id}`)).json()) as { attached: boolean }
    assert.equal(view.attached, true)
    // Unauthorized still rejected.
    assert.equal((await postJson(app, '/sessions/me/heartbeat', {})).status, 401)
  })

  test('messages: POST /sessions/:id/messages records user_message; 404 after destroy', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const res = await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })
    assert.equal(res.status, 201)
    const ev = (await res.json()) as { type: string; sequence: number; payload: { text: string } }
    assert.equal(ev.type, 'user_message')
    assert.equal(ev.sequence, 0)
    assert.equal(ev.payload.text, 'hi')

    // 400 on empty text
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { text: '' })).status,
      400,
    )

    // destroy session → next message gets 404 (row is gone)
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

    // images-only (no text) records a user_message carrying the images.
    const res = await postJson(app, `/sessions/${session.id}/messages`, { text: '', images: [img] })
    assert.equal(res.status, 201)
    const ev = (await res.json()) as { type: string; payload: { text: string; images: string[] } }
    assert.equal(ev.type, 'user_message')
    assert.deepEqual(ev.payload.images, [img])

    // neither text nor images → 400
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { images: [] })).status,
      400,
    )

    // oversized image → 413
    const huge = `data:image/png;base64,${'A'.repeat(8_000_001)}`
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { images: [huge] })).status,
      413,
    )
  })

  test('worker events (bearer): turn_start marks message processed; busy derived from event log', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const msgRes = await postJson(app, `/sessions/${session.id}/messages`, { text: 'work' })
    const msg = (await msgRes.json()) as { id: number }

    const auth = { authorization: `Bearer ${session.apiToken}` }

    // Unauthorized rejected.
    assert.equal(
      (await postJson(app, '/sessions/me/events', { type: 'sdk_event', payload: {} })).status,
      401,
    )

    // turn_start consumes the message → busy=true (derived).
    await postJson(
      app,
      '/sessions/me/events',
      { type: 'turn_start', payload: { messageId: msg.id } },
      auth,
    )
    const busy = (await (await app.request(`/sessions/${session.id}`)).json()) as { busy: boolean }
    assert.equal(busy.busy, true)

    // Stream an SDK event.
    await postJson(
      app,
      '/sessions/me/events',
      { type: 'sdk_event', payload: { type: 'assistant', text: 'thinking' } },
      auth,
    )

    // turn_complete → busy back to false.
    await postJson(
      app,
      '/sessions/me/events',
      { type: 'turn_complete', payload: { exitCode: 0 } },
      auth,
    )
    const idle = (await (await app.request(`/sessions/${session.id}`)).json()) as { busy: boolean }
    assert.equal(idle.busy, false)

    // Event log contains user + turn_start + sdk + turn_complete in order.
    const events = (await (await app.request(`/sessions/${session.id}/events`)).json()) as Array<{
      type: string
    }>
    assert.deepEqual(
      events.map(e => e.type),
      ['user_message', 'turn_start', 'sdk_event', 'turn_complete'],
    )
  })
})
