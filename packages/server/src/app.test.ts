import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from './app.ts'
import { startServer } from './server.ts'
import { freshStore, type TestStore } from './store/test-db.ts'

const postJson = (
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
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
  })

  test('items lookup resolves R / T (sessions navigate by int id, not S-N)', async () => {
    const app = createApp(ctx.store)
    type WithId = { id: number }
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

  test('real node server start/stop + /health', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const res = await fetch(`http://localhost:${server.port}/health`)
      assert.deepEqual(await res.json(), { ok: true })
    } finally {
      await server.stop()
    }
  })

  // === M2.5: session chat protocol ===

  const seedSession = async (app: ReturnType<typeof createApp>) => {
    type WithId = { id: number }
    const w = (await (await postJson(app, '/workspaces', { name: 'w' })).json()) as WithId
    const p = (await (
      await postJson(app, '/projects', { workspaceId: w.id, name: 'p' })
    ).json()) as WithId
    const s = (await (
      await postJson(app, '/sessions', {
        projectId: p.id,
        mode: 'worker',
        name: 'dogfood',
        claudeSessionId: 'aaaa-bbbb-cccc-dddd',
        worktreePath: '/tmp/wt',
        machineId: 'mid-test',
        hostname: 'h-test',
        workerName: 'ben-laptop',
      })
    ).json()) as WithId & { apiToken: string; alive: boolean; busy: boolean }
    return { projectId: p.id, session: s }
  }

  test('session register: returns int id + apiToken + view fields (alive/busy)', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    assert.equal(typeof session.id, 'number')
    assert.equal(typeof session.apiToken, 'string')
    assert.equal(session.busy, false)
    // alive is false until a worker pings — none has, so machineId 'mid-test' isn't live yet
    assert.equal(session.alive, false)
  })

  test('messages: POST /sessions/:id/messages records user_message + 409 on closed', async () => {
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

    // close session → next message gets 409
    await app.request(`/sessions/me/close`, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.apiToken}` },
    })
    assert.equal(
      (await postJson(app, `/sessions/${session.id}/messages`, { text: 'hi' })).status,
      409,
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

  test('worker register: creates fresh worker + alive=true after first ping', async () => {
    const app = createApp(ctx.store)
    type WithId = { id: number }
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
    type WithId = { id: number }
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

  test('SSE: replays history then pushes new events as they arrive', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json', ...headers },
        })
      type WithId = { id: number }
      const w = (await (await post('/workspaces', { name: 'w' })).json()) as WithId
      const p = (await (await post('/projects', { workspaceId: w.id, name: 'p' })).json()) as WithId
      const s = (await (
        await post('/sessions', { projectId: p.id, mode: 'worker', name: 'sse-test' })
      ).json()) as WithId & { apiToken: string }
      await post(`/sessions/${s.id}/messages`, { text: 'first' })

      const controller = new AbortController()
      const res = await fetch(`${base}/sessions/${s.id}/stream`, {
        signal: controller.signal,
        headers: { accept: 'text/event-stream' },
      })
      assert.equal(res.status, 200)
      const reader = res.body?.getReader()
      assert.ok(reader)
      const dec = new TextDecoder()
      const readUntil = async (n: number, ms: number): Promise<string> => {
        let buf = ''
        const start = Date.now()
        while (Date.now() - start < ms) {
          const r = await Promise.race([
            reader.read(),
            new Promise<{ done: true; value?: undefined }>(res2 =>
              setTimeout(() => res2({ done: true }), ms - (Date.now() - start)),
            ),
          ])
          if (!r || r.done || !r.value) break
          buf += dec.decode(r.value)
          const hits = (buf.match(/^data:/gm) ?? []).length
          if (hits >= n) break
        }
        return buf
      }
      // Replay carries the first user_message.
      let chunk = await readUntil(1, 1500)
      assert.match(chunk, /"text":"first"/)

      // New live event arrives.
      await post(`/sessions/${s.id}/messages`, { text: 'live' })
      chunk = await readUntil(2, 1500)
      assert.match(chunk, /"text":"live"/)

      controller.abort()
      await reader.cancel().catch(() => {})
    } finally {
      await server.stop()
    }
  })
})
