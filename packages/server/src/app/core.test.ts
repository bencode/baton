import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { startServer } from '../server.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, type WithCode, type WithId } from './test-helpers.ts'

describe('server HTTP — core', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('/health', async () => {
    const res = await createApp(ctx.store).request('/health')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
  })

  test('workspace → project → requirement → task end-to-end over HTTP', async () => {
    const app = createApp(ctx.store)
    const w = (await (await postJson(app, '/workspaces', { name: 'eng' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    const r = (await (
      await postJson(app, '/requirements', { projectId: p.id, title: 'login' })
    ).json()) as WithCode
    assert.equal(r.code, 'R-1')
    const t = (await (
      await postJson(app, '/tasks', { requirementId: r.id, title: 'impl' })
    ).json()) as WithCode
    assert.equal(t.code, 'T-1')
    const tasks = (await (await app.request(`/requirements/${r.id}/tasks`)).json()) as WithId[]
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0]?.id, t.id)
  })

  test('task comments: append-only over HTTP, ordered, with worker attribution', async () => {
    const app = createApp(ctx.store)
    const w = (await (await postJson(app, '/workspaces', { name: 'eng' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    const r = (await (
      await postJson(app, '/requirements', { projectId: p.id, title: 'login' })
    ).json()) as WithId
    const t = (await (
      await postJson(app, '/tasks', { requirementId: r.id, title: 'impl' })
    ).json()) as WithId

    assert.equal(
      (await postJson(app, `/tasks/${t.id}/comments`, { body: 'human note' })).status,
      201,
    )
    const second = await postJson(app, `/tasks/${t.id}/comments`, {
      body: 'agent hand-off',
      workerId: 42,
    })
    assert.equal(second.status, 201)

    const list = (await (await app.request(`/tasks/${t.id}/comments`)).json()) as {
      body: string
      workerId?: number
    }[]
    assert.deepEqual(
      list.map(x => x.body),
      ['human note', 'agent hand-off'],
    )
    assert.equal(list[0]?.workerId, undefined)
    assert.equal(list[1]?.workerId, 42)

    // missing body → 400; comment on a missing task → 404
    assert.equal((await postJson(app, `/tasks/${t.id}/comments`, {})).status, 400)
    assert.equal((await postJson(app, '/tasks/999/comments', { body: 'x' })).status, 404)
    assert.equal((await app.request('/tasks/999/comments')).status, 404)
  })

  test('items lookup resolves R / T (sessions navigate by int id, not S-N)', async () => {
    const app = createApp(ctx.store)
    const w = (await (await postJson(app, '/workspaces', { name: 'eng' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    await postJson(app, '/requirements', { projectId: p.id, title: 'r' })
    const reqLookup = (await (await app.request(`/projects/${p.id}/items/R-1`)).json()) as {
      kind: string
    }
    assert.equal(reqLookup.kind, 'requirement')
    // S- is no longer a recognised prefix (sessions don't carry codes)
    assert.equal((await app.request(`/projects/${p.id}/items/S-1`)).status, 400)
    assert.equal((await app.request(`/projects/${p.id}/items/X-1`)).status, 400)
  })

  test('missing field → 400; missing entity → 404', async () => {
    const app = createApp(ctx.store)
    assert.equal((await postJson(app, '/workspaces', {})).status, 400)
    assert.equal((await app.request('/workspaces/999')).status, 404)
  })

  test('PATCH renames workspace + project; 404 missing; 409 on duplicate name', async () => {
    const app = createApp(ctx.store)
    const patch = (path: string, body: unknown) =>
      app.request(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      })
    const w = (await (await postJson(app, '/workspaces', { name: 'eng' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'daily' })
    ).json()) as WithId

    // rename workspace + project
    const wRes = await patch(`/workspaces/${w.id}`, { name: 'trantor' })
    assert.equal(wRes.status, 200)
    assert.equal(((await wRes.json()) as { name: string }).name, 'trantor')
    const pRes = await patch(`/projects/${p.id}`, { name: 'ops', description: 'd' })
    assert.equal(pRes.status, 200)
    const pv = (await pRes.json()) as { name: string; description: string }
    assert.equal(pv.name, 'ops')
    assert.equal(pv.description, 'd')

    // missing → 404
    assert.equal((await patch('/workspaces/999', { name: 'x' })).status, 404)
    // duplicate workspace name → 409
    await postJson(app, '/workspaces', { name: 'other' })
    assert.equal((await patch(`/workspaces/${w.id}`, { name: 'other' })).status, 409)
  })

  test('real node server start/stop + /health', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const res = await fetch(`http://localhost:${server.port}/health`)
      assert.deepEqual(await res.json(), { ok: true })
    } finally {
      await server.stop()
    }
  })
})
