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

  // === M2: sessions / assignments / claim / SSE ===

  // Seed a workspace + project + requirement + one task, and return their ids.
  const seedTask = async (app: ReturnType<typeof createApp>) => {
    type WithId = { id: number }
    const w = (await (await postJson(app, '/workspaces', { name: 'eng' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    const r = (await (
      await postJson(app, '/requirements', { projectId: p.id, title: 'r' })
    ).json()) as WithId
    const t = (await (
      await postJson(app, '/tasks', { requirementId: r.id, title: 'work' })
    ).json()) as WithId
    return { workspaceId: w.id, projectId: p.id, requirementId: r.id, taskId: t.id }
  }

  test('session register → /sessions/me/* requires bearer; wrong token → 401', async () => {
    const app = createApp(ctx.store)
    const { projectId } = await seedTask(app)
    const s = (await (
      await postJson(app, '/sessions', { projectId, mode: 'worker', name: 'w1' })
    ).json()) as { id: number; code: string; apiToken: string }
    assert.equal(s.code, 'S-1')
    assert.equal(typeof s.apiToken, 'string')

    // No header → 401
    assert.equal((await postJson(app, '/sessions/me/heartbeat', {})).status, 401)
    // Wrong token → 401
    const wrong = await app.request('/sessions/me/heartbeat', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-token' },
    })
    assert.equal(wrong.status, 401)
    // Correct → 200
    const ok = await app.request('/sessions/me/heartbeat', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiToken}` },
    })
    assert.equal(ok.status, 200)
  })

  test('claim end-to-end: bearer → /sessions/me/claim returns assignment+task, no work → 204', async () => {
    const app = createApp(ctx.store)
    const { projectId, taskId } = await seedTask(app)
    const s = (await (
      await postJson(app, '/sessions', { projectId, mode: 'worker', name: 'w1' })
    ).json()) as { id: number; apiToken: string }
    const claim = await app.request('/sessions/me/claim', {
      method: 'POST',
      headers: { authorization: `Bearer ${s.apiToken}` },
    })
    assert.equal(claim.status, 200)
    const { assignment, task } = (await claim.json()) as {
      assignment: { id: number; code: string; status: string }
      task: { id: number; status: string }
    }
    assert.equal(task.id, taskId)
    assert.equal(task.status, 'in_progress')
    assert.equal(assignment.code, 'A-1')
    assert.equal(assignment.status, 'running')

    // No more eligible work → 204
    const empty = await app.request('/sessions/me/claim', {
      method: 'POST',
      headers: { authorization: `Bearer ${s.apiToken}` },
    })
    assert.equal(empty.status, 204)
  })

  test('assignment events: ownership enforced; complete updates task status', async () => {
    const app = createApp(ctx.store)
    const { projectId, taskId } = await seedTask(app)
    const s1 = (await (
      await postJson(app, '/sessions', { projectId, mode: 'worker', name: 'w1' })
    ).json()) as { apiToken: string }
    const s2 = (await (
      await postJson(app, '/sessions', { projectId, mode: 'worker', name: 'w2' })
    ).json()) as { apiToken: string }
    const claim = (await (
      await app.request('/sessions/me/claim', {
        method: 'POST',
        headers: { authorization: `Bearer ${s1.apiToken}` },
      })
    ).json()) as { assignment: { id: number } }
    const assignmentId = claim.assignment.id

    // s2 trying to post events for s1's assignment → 403
    const forbidden = await app.request(`/assignments/${assignmentId}/events`, {
      method: 'POST',
      body: JSON.stringify({ sequence: 0, payload: { type: 'x' } }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s2.apiToken}` },
    })
    assert.equal(forbidden.status, 403)

    // s1 (owner) → 201
    const okEvent = await app.request(`/assignments/${assignmentId}/events`, {
      method: 'POST',
      body: JSON.stringify({ sequence: 0, payload: { type: 'status', s: 'starting' } }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s1.apiToken}` },
    })
    assert.equal(okEvent.status, 201)

    // s1 completes done
    const completed = await app.request(`/assignments/${assignmentId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ status: 'done', result: 'ok' }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s1.apiToken}` },
    })
    assert.equal(completed.status, 200)
    const task = (await (await app.request(`/tasks/${taskId}`)).json()) as { status: string }
    assert.equal(task.status, 'done')
  })

  test('SSE stream: replays history then pushes new events as they arrive', async () => {
    // Use a real Node server so we can use EventSource semantics via fetch streaming.
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json', ...headers },
        })
      const w = (await (await post('/workspaces', { name: 'w' })).json()) as { id: number }
      const p = (await (await post('/projects', { workspaceId: w.id, name: 'p' })).json()) as {
        id: number
      }
      const r = (await (await post('/requirements', { projectId: p.id, title: 'r' })).json()) as {
        id: number
      }
      await post('/tasks', { requirementId: r.id, title: 't' })
      const sess = (await (
        await post('/sessions', { projectId: p.id, mode: 'worker', name: 's' })
      ).json()) as { apiToken: string }
      const claim = (await (
        await post('/sessions/me/claim', {}, { authorization: `Bearer ${sess.apiToken}` })
      ).json()) as { assignment: { id: number } }
      const aid = claim.assignment.id

      // Pre-existing event (in history)
      await post(
        `/assignments/${aid}/events`,
        { sequence: 0, payload: { type: 'pre' } },
        { authorization: `Bearer ${sess.apiToken}` },
      )

      // Open SSE
      const controller = new AbortController()
      const streamRes = await fetch(`${base}/assignments/${aid}/stream`, {
        signal: controller.signal,
        headers: { accept: 'text/event-stream' },
      })
      assert.equal(streamRes.status, 200)
      assert.match(streamRes.headers.get('content-type') ?? '', /event-stream/)
      const reader = streamRes.body?.getReader()
      assert.ok(reader)
      const decoder = new TextDecoder()
      const readUntil = async (n: number, ms: number): Promise<string> => {
        let buf = ''
        const start = Date.now()
        while (Date.now() - start < ms) {
          const r = await Promise.race([
            reader.read(),
            new Promise<{ done: true; value?: undefined }>(res =>
              setTimeout(() => res({ done: true }), ms - (Date.now() - start)),
            ),
          ])
          if (!r || r.done || !r.value) break
          buf += decoder.decode(r.value)
          if ((buf.match(/\ndata:/g) ?? []).length + (buf.startsWith('data:') ? 1 : 0) >= n) break
        }
        return buf
      }
      // Replay should arrive immediately.
      let chunk = await readUntil(1, 1500)
      assert.match(chunk, /"sequence":0/)

      // Push another → should arrive via subscription.
      await post(
        `/assignments/${aid}/events`,
        { sequence: 1, payload: { type: 'live' } },
        { authorization: `Bearer ${sess.apiToken}` },
      )
      chunk = await readUntil(2, 1500)
      assert.match(chunk, /"sequence":1/)

      controller.abort()
      await reader.cancel().catch(() => {})
    } finally {
      await server.stop()
    }
  })
})
