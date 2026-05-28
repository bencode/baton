import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from './app.ts'
import { startServer } from './server.ts'
import { freshStore, type TestStore } from './store/test-db.ts'

const postJson = (app: ReturnType<typeof createApp>, path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

describe('server HTTP', () => {
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
    type WithId = { id: number }
    type WithCode = WithId & { code: string }
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
    const full = (await (await app.request(`/requirements/${r.id}/full`)).json()) as {
      requirement: { title: string }
      tasks: unknown[]
    }
    assert.equal(full.requirement.title, 'login')
    assert.equal(full.tasks.length, 1)
  })

  test('GET /projects/:projectId/items/:code resolves R-N and T-N', async () => {
    const app = createApp(ctx.store)
    type WithId = { id: number }
    const w = (await (await postJson(app, '/workspaces', { name: 'eng' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    await postJson(app, '/requirements', { projectId: p.id, title: 'r' })
    const r = (await (await app.request(`/projects/${p.id}/items/R-1`)).json()) as {
      kind: string
      item: { title: string }
    }
    assert.equal(r.kind, 'requirement')
    assert.equal(r.item.title, 'r')
    assert.equal((await app.request(`/projects/${p.id}/items/T-99`)).status, 404)
    assert.equal((await app.request(`/projects/${p.id}/items/X-1`)).status, 400)
  })

  test('missing field → 400; missing entity → 404', async () => {
    const app = createApp(ctx.store)
    assert.equal((await postJson(app, '/workspaces', {})).status, 400)
    assert.equal((await app.request('/workspaces/999')).status, 404)
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

  test('PATCH advances status; DELETE then GET → 404', async () => {
    const app = createApp(ctx.store)
    type WithIdStatus = { id: number; status: string }
    const w = (await (await postJson(app, '/workspaces', { name: 'eng' })).json()) as { id: number }
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as { id: number }
    const r = (await (
      await postJson(app, '/requirements', { projectId: p.id, title: 'r' })
    ).json()) as WithIdStatus

    const patched = (await (
      await app.request(`/requirements/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' }),
        headers: { 'content-type': 'application/json' },
      })
    ).json()) as WithIdStatus
    assert.equal(patched.status, 'done')

    assert.equal((await app.request(`/workspaces/${w.id}`, { method: 'DELETE' })).status, 204)
    assert.equal((await app.request(`/workspaces/${w.id}`)).status, 404)
  })
})
