import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { Loop } from '@baton/shared'
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

  test('clear configuration has its own clock; saving, pausing and resuming preserve it', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const before = Date.now()
    const response = await postJson(app, `/sessions/${session.id}/loops`, {
      message: 'collect',
      intervalSec: 60,
      clearAfterSec: 7_200,
    })
    assert.equal(response.status, 201)
    const initial = (await response.json()) as Loop
    assert.equal(initial.clearAfterSec, 7_200)
    assert.ok(initial.nextClearAt !== undefined && initial.nextClearAt >= before + 7_200_000)
    assert.ok(initial.nextClearAt <= Date.now() + 7_200_000)
    const patch = (body: Record<string, unknown>) =>
      app.request(`/loops/${initial.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    for (const body of [{ clearAfterSec: 7_200 }, { enabled: false }, { enabled: true }]) {
      const saved = (await (await patch(body)).json()) as Loop
      assert.equal(saved.nextClearAt, initial.nextClearAt)
    }
    const beforeChange = await ctx.store.loops.get(initial.id)
    const changed = (await (await patch({ clearAfterSec: 3_600 })).json()) as Loop
    assert.equal(changed.nextRunAt, beforeChange?.nextRunAt)
    assert.ok(changed.nextClearAt !== undefined && changed.nextClearAt < initial.nextClearAt)
    const disabled = (await (await patch({ clearAfterSec: null })).json()) as Loop
    assert.equal(disabled.clearAfterSec, undefined)
    assert.equal(disabled.nextClearAt, undefined)
    const restarted = (await (await patch({ clearAfterSec: 7_200 })).json()) as Loop
    assert.equal(restarted.clearAfterSec, 7_200)
    assert.ok(restarted.nextClearAt !== undefined && restarted.nextClearAt >= initial.nextClearAt)
  })

  test('clear is opt-in, validates durations and does not accept a client deadline', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const response = await postJson(app, `/sessions/${session.id}/loops`, {
      message: 'collect',
      intervalSec: 60,
      nextClearAt: 1,
    })
    const loop = (await response.json()) as Loop
    assert.equal(loop.clearAfterSec, undefined)
    assert.equal(loop.nextClearAt, undefined)
    for (const clearAfterSec of [29, 91 * 86_400, '2h', true]) {
      assert.equal(
        (
          await postJson(app, `/sessions/${session.id}/loops`, {
            message: 'collect',
            intervalSec: 60,
            clearAfterSec,
          })
        ).status,
        400,
      )
      const patch = await app.request(`/loops/${loop.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearAfterSec }),
      })
      assert.equal(patch.status, 400)
    }
    const ignored = await app.request(`/loops/${loop.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nextClearAt: 1 }),
    })
    assert.equal(((await ignored.json()) as Loop).nextClearAt, undefined)
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
