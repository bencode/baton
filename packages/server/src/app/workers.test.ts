import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, type WithId } from './test-helpers.ts'

describe('server HTTP — workers', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('worker register: creates fresh worker + alive=true after first ping', async () => {
    const app = createApp(ctx.store)
    const w = (await (await postJson(app, '/workspaces', { name: 'w' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    const res = await postJson(app, '/workers', {
      projectId: p.id,
      machineId: 'mid-1',
      name: 'ben-laptop',
      hostname: 'bens-air.local',
    })
    assert.equal(res.status, 201)
    const body = (await res.json()) as {
      worker: { id: number; alive: boolean; machineId: string }
      outcome: string
    }
    assert.equal(body.outcome, 'created')
    assert.equal(body.worker.alive, true)
    assert.equal(body.worker.machineId, 'mid-1')

    // Listed under the project
    const list = (await (await app.request(`/projects/${p.id}/workers`)).json()) as Array<{
      id: number
      alive: boolean
    }>
    assert.equal(list.length, 1)
    assert.equal(list[0]?.alive, true)
  })

  test('worker register: name collision (different machineId) → 409', async () => {
    const app = createApp(ctx.store)
    const w = (await (await postJson(app, '/workspaces', { name: 'w' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    await postJson(app, '/workers', {
      projectId: p.id,
      machineId: 'mid-1',
      name: 'shared-name',
      hostname: 'h-a',
    })
    const collide = await postJson(app, '/workers', {
      projectId: p.id,
      machineId: 'mid-2',
      name: 'shared-name',
      hostname: 'h-b',
    })
    assert.equal(collide.status, 409)
  })
})
