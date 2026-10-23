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

  test('clear count survives edits, pausing and resuming; turning it off resets the count', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const response = await postJson(app, `/sessions/${session.id}/loops`, {
      message: 'collect',
      intervalSec: 60,
      clearEveryRuns: 4,
    })
    assert.equal(response.status, 201)
    const initial = (await response.json()) as Loop
    assert.equal(initial.clearEveryRuns, 4)
    assert.equal(initial.runsSinceClear, 0)
    await ctx.store.loops.update(initial.id, { runsSinceClear: 3 })
    const patch = async (body: Record<string, unknown>) =>
      (await (
        await app.request(`/loops/${initial.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json()) as Loop
    for (const body of [
      { clearEveryRuns: 2 },
      { enabled: false },
      { enabled: true },
      { intervalSec: 120, message: 'collect more' },
    ])
      assert.equal((await patch(body)).runsSinceClear, 3)
    const off = await patch({ clearEveryRuns: null })
    assert.equal(off.clearEveryRuns, undefined)
    assert.equal(off.runsSinceClear, 0)
  })

  test('clear is opt-in and only accepts a whole run count from 1 to 1000', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const response = await postJson(app, `/sessions/${session.id}/loops`, {
      message: 'collect',
      intervalSec: 60,
    })
    const loop = (await response.json()) as Loop
    assert.equal(loop.clearEveryRuns, undefined)
    for (const clearEveryRuns of [0, 1.5, 1001, '2', true]) {
      assert.equal(
        (
          await postJson(app, `/sessions/${session.id}/loops`, {
            message: 'collect',
            intervalSec: 60,
            clearEveryRuns,
          })
        ).status,
        400,
      )
      const patch = await app.request(`/loops/${loop.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearEveryRuns }),
      })
      assert.equal(patch.status, 400)
    }
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
