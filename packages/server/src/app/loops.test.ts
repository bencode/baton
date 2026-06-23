import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, seedSession } from './test-helpers.ts'

describe('server HTTP — loops', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('create → list → get → patch → delete, with validation', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)

    const created = await postJson(app, `/sessions/${session.id}/loops`, {
      name: 'nudge',
      message: 'continue the plan',
      intervalSec: 60,
    })
    assert.equal(created.status, 201)
    const loop = (await created.json()) as {
      id: number
      enabled: boolean
      nextRunAt: number
      intervalSec: number
      lastStatus?: string
    }
    assert.equal(loop.enabled, true)
    assert.equal(loop.intervalSec, 60)
    assert.ok(loop.nextRunAt > Date.now()) // first beat is one interval out
    assert.equal(loop.lastStatus, undefined)

    // validation: empty message + sub-minimum interval are rejected
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/loops`, { message: '', intervalSec: 60 }))
        .status,
      400,
    )
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/loops`, { message: 'x', intervalSec: 5 }))
        .status,
      400,
    )

    const list = (await (await app.request(`/sessions/${session.id}/loops`)).json()) as unknown[]
    assert.equal(list.length, 1)
    assert.equal((await app.request(`/loops/${loop.id}`)).status, 200)

    // patch: disable + re-interval (the interval change re-anchors nextRunAt)
    const patched = await app.request(`/loops/${loop.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false, intervalSec: 120 }),
      headers: { 'content-type': 'application/json' },
    })
    assert.equal(patched.status, 200)
    const pv = (await patched.json()) as { enabled: boolean; intervalSec: number }
    assert.equal(pv.enabled, false)
    assert.equal(pv.intervalSec, 120)

    assert.equal((await app.request(`/loops/${loop.id}`, { method: 'DELETE' })).status, 204)
    assert.equal((await app.request(`/loops/${loop.id}`)).status, 404)
  })

  test('loops cascade away when their session is destroyed', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    await postJson(app, `/sessions/${session.id}/loops`, { message: 'm', intervalSec: 60 })
    await ctx.store.sessions.destroy(session.id)
    assert.deepEqual(await ctx.store.loops.listBySession(session.id), [])
  })

  test('intervalSec above the 90d ceiling is rejected', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const tooBig = 91 * 86_400
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/loops`, { message: 'x', intervalSec: tooBig }))
        .status,
      400,
    )
  })

  test('activeCounts counts only enabled loops; SessionView.activeLoops surfaces it', async () => {
    const app = createApp(ctx.store)
    const { session, projectId } = await seedSession(app)
    await postJson(app, `/sessions/${session.id}/loops`, { message: 'on', intervalSec: 60 })
    await postJson(app, `/sessions/${session.id}/loops`, {
      message: 'off',
      intervalSec: 60,
      enabled: false,
    })

    const counts = await ctx.store.loops.activeCountsBySessions([session.id])
    assert.equal(counts.get(session.id), 1) // disabled one not counted

    const list = (await (await app.request(`/projects/${projectId}/sessions`)).json()) as {
      id: number
      activeLoops: number
    }[]
    assert.equal(list.find(s => s.id === session.id)?.activeLoops, 1)
  })
})
