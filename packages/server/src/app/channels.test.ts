import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { startServer } from '../server.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'

// Read from an SSE reader until `n` `data:` frames seen or `ms` elapses.
const readUntil = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  n: number,
  ms: number,
): Promise<string> => {
  const dec = new TextDecoder()
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
    buf += dec.decode(r.value)
    if ((buf.match(/^data:/gm) ?? []).length >= n) break
  }
  return buf
}

type Channel = { channelId: string; token: string }

describe('server HTTP — channel room', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('create, auth gating, presence, addressing, poll, multi-subscriber stream', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}${path}`, {
          method,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: { 'content-type': 'application/json', ...headers },
        })
      const post = (path: string, body: unknown, headers?: Record<string, string>) =>
        send('POST', path, body, headers)
      const get = (path: string, headers: Record<string, string> = {}) =>
        fetch(`${base}${path}`, { headers })

      // Create (no auth).
      const ch = (await (await post('/channels', { title: 'room' })).json()) as Channel
      assert.ok(ch.channelId && ch.token)
      const auth = { authorization: `Bearer ${ch.token}` }
      const msgs = `/channels/${ch.channelId}/messages`

      // Auth gating across guarded routes.
      assert.equal((await post(msgs, { text: 'x' })).status, 401) // no token
      assert.equal((await post(msgs, { text: 'x' }, { authorization: 'Bearer nope' })).status, 401)
      assert.equal((await post('/channels/missing/messages', { text: 'x' }, auth)).status, 404)
      assert.equal((await post(msgs, {}, auth)).status, 400) // missing text
      assert.equal((await get(`/channels/${ch.channelId}/members`)).status, 401) // no token

      // GET channel meta — title round-trips, token never echoed.
      const meta = (await (await get(`/channels/${ch.channelId}`, auth)).json()) as {
        title?: string
        token?: string
      }
      assert.equal(meta.title, 'room')
      assert.equal(meta.token, undefined)

      // Member sub-resource: PUT join as human → roster shows kind.
      const joined = (await (
        await send('PUT', `/channels/${ch.channelId}/members/alice`, { kind: 'human' }, auth)
      ).json()) as { members: { name: string; kind: string }[] }
      assert.deepEqual(
        joined.members.map(m => `${m.name}:${m.kind}`),
        ['alice:human'],
      )

      // Posting as bob refreshes presence (activity touch). seq 1, broadcast.
      assert.equal((await post(msgs, { from: 'bob', text: 'hello all' }, auth)).status, 201)
      const roster = (await (await get(`/channels/${ch.channelId}/members`, auth)).json()) as {
        members: { name: string }[]
      }
      assert.deepEqual(roster.members.map(m => m.name).sort(), ['alice', 'bob'])

      // DELETE leave removes alice.
      assert.equal(
        (await send('DELETE', `/channels/${ch.channelId}/members/alice`, undefined, auth)).status,
        204,
      )
      const roster2 = (await (await get(`/channels/${ch.channelId}/members`, auth)).json()) as {
        members: { name: string }[]
      }
      assert.deepEqual(
        roster2.members.map(m => m.name),
        ['bob'],
      )

      // Addressing: a directed message + the ?for filter. seq 2, to alice.
      await post(msgs, { from: 'carol', text: 'psst', to: ['alice'] }, auth)
      const forAlice = (await (await get(`${msgs}?since=0&for=alice`, auth)).json()) as {
        messages: { text: string }[]
      }
      assert.deepEqual(forAlice.messages.map(m => m.text), ['hello all', 'psst']) // broadcast + to-alice
      const forDan = (await (await get(`${msgs}?since=0&for=dan`, auth)).json()) as {
        messages: { text: string }[]
      }
      assert.deepEqual(forDan.messages.map(m => m.text), ['hello all']) // broadcast only

      // Poll since a cursor.
      const since1 = (await (await get(`${msgs}?since=1`, auth)).json()) as {
        messages: { seq: number }[]
      }
      assert.deepEqual(since1.messages.map(m => m.seq), [2])

      // Bad token on the stream is rejected before streaming.
      assert.equal(
        (
          await fetch(`${base}/channels/${ch.channelId}/stream`, {
            headers: { authorization: 'Bearer nope', accept: 'text/event-stream' },
          })
        ).status,
        401,
      )

      // Two subscribers both replay 'psst' (seq>1), then both get a live message.
      const ctl = new AbortController()
      try {
        const open = () =>
          fetch(`${base}/channels/${ch.channelId}/stream?since=1`, {
            signal: ctl.signal,
            headers: { ...auth, accept: 'text/event-stream' },
          })
        const [r1, r2] = await Promise.all([open(), open()])
        assert.equal(r1.status, 200)
        assert.equal(r2.status, 200)
        const rd1 = r1.body?.getReader()
        const rd2 = r2.body?.getReader()
        assert.ok(rd1 && rd2)
        assert.match(await readUntil(rd1, 1, 1500), /"text":"psst"/)
        assert.match(await readUntil(rd2, 1, 1500), /"text":"psst"/)
        await post(msgs, { from: 'bob', text: 'live' }, auth)
        assert.match(await readUntil(rd1, 2, 1500), /"text":"live"/)
        assert.match(await readUntil(rd2, 2, 1500), /"text":"live"/)
      } finally {
        ctl.abort()
      }
    } finally {
      await server.stop()
    }
  })

  test('DELETE /channels/:id: token-gated, removes the room', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const ch = (await (
        await fetch(`${base}/channels`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).json()) as Channel
      const auth = { authorization: `Bearer ${ch.token}` }
      await fetch(`${base}/channels/${ch.channelId}/messages`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ from: 'a', text: 'x' }),
      })
      const del = (headers: Record<string, string>) =>
        fetch(`${base}/channels/${ch.channelId}`, { method: 'DELETE', headers })
      assert.equal((await del({ authorization: 'Bearer nope' })).status, 401) // bad token can't delete
      assert.equal((await del(auth)).status, 204) // deleted
      // Gone: a follow-up GET 404s, and a double-delete 404s (guard rejects first).
      assert.equal((await fetch(`${base}/channels/${ch.channelId}`, { headers: auth })).status, 404)
      assert.equal((await del(auth)).status, 404)
    } finally {
      await server.stop()
    }
  })

  test('JOIN claims a unique name: collision 409, free again after leave', async () => {
    const app = createApp(ctx.store)
    const ch = (await (
      await app.request('/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).json()) as Channel
    const auth = { authorization: `Bearer ${ch.token}`, 'content-type': 'application/json' }
    const member = (method: string) =>
      app.request(`/channels/${ch.channelId}/members/alice`, { method, headers: auth, body: '{}' })

    assert.equal((await member('PUT')).status, 200) // first claim wins
    const dup = await member('PUT')
    assert.equal(dup.status, 409) // same name, still online → rejected
    const body = (await dup.json()) as { error: string; members: { name: string }[] }
    assert.equal(body.error, 'name taken')
    assert.deepEqual(body.members.map(m => m.name), ['alice']) // roster comes back so caller can pick another
    assert.equal((await member('DELETE')).status, 204) // alice leaves → name freed
    assert.equal((await member('PUT')).status, 200) // reclaimable
  })

  test('self-describing: manifest (token-gated) + /channels/help (no auth)', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      // Protocol help: reachable with NO token (a fresh invitee can read it).
      const help = await fetch(`${base}/channels/help`)
      assert.equal(help.status, 200)
      assert.match(help.headers.get('content-type') ?? '', /text\/markdown/)
      assert.match(await help.text(), /baton channel — protocol/)

      // Create with a description; response points at the help.
      const created = (await (
        await fetch(`${base}/channels`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'sync', description: 'where alice + bob plan' }),
        })
      ).json()) as Channel & { help: string }
      assert.equal(created.help, '/channels/help')
      const auth = { authorization: `Bearer ${created.token}` }

      // Manifest is token-gated.
      assert.equal((await fetch(`${base}/channels/${created.channelId}`)).status, 401)

      // Join, then the manifest reflects description + online roster + help.
      await fetch(`${base}/channels/${created.channelId}/members/alice`, {
        method: 'PUT',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'human' }),
      })
      const m = (await (await fetch(`${base}/channels/${created.channelId}`, { headers: auth })).json()) as {
        title?: string
        description?: string
        help: string
        token?: string
        members: { name: string; kind: string }[]
      }
      assert.equal(m.title, 'sync')
      assert.equal(m.description, 'where alice + bob plan')
      assert.equal(m.help, '/channels/help')
      assert.equal(m.token, undefined) // never leak the token
      assert.deepEqual(m.members.map(x => `${x.name}:${x.kind}`), ['alice:human'])
    } finally {
      await server.stop()
    }
  })

  test('PATCH /channels/:id updates topic; token-gated; manifest reflects it', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const ch = (await (
        await fetch(`${base}/channels`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ description: 'old rules' }),
        })
      ).json()) as Channel
      const auth = { authorization: `Bearer ${ch.token}`, 'content-type': 'application/json' }
      const patch = (body: unknown, headers: Record<string, string>) =>
        fetch(`${base}/channels/${ch.channelId}`, { method: 'PATCH', body: JSON.stringify(body), headers })

      assert.equal((await patch({ description: 'x' }, { 'content-type': 'application/json' })).status, 401) // no token
      assert.equal(
        (await patch({ description: 'x' }, { authorization: 'Bearer nope', 'content-type': 'application/json' }))
          .status,
        401, // bad token on an existing channel → forbidden
      )
      assert.equal(
        (
          await fetch(`${base}/channels/missing-id`, {
            method: 'PATCH',
            body: '{"description":"x"}',
            headers: auth,
          })
        ).status,
        404, // unknown channel
      )
      assert.equal((await patch({}, auth)).status, 400) // empty patch
      const ok = await patch({ title: 'sync', description: 'new rules' }, auth)
      assert.equal(ok.status, 200)
      const updated = (await ok.json()) as { description?: string; token?: string }
      assert.equal(updated.description, 'new rules')
      assert.equal(updated.token, undefined)
      // Manifest reflects the update.
      const m = (await (
        await fetch(`${base}/channels/${ch.channelId}`, { headers: { authorization: `Bearer ${ch.token}` } })
      ).json()) as { title?: string; description?: string }
      assert.equal(m.title, 'sync')
      assert.equal(m.description, 'new rules')
      // Updating only one field leaves the other untouched.
      const t = (await (await patch({ title: 'renamed' }, auth)).json()) as {
        title?: string
        description?: string
      }
      assert.equal(t.title, 'renamed')
      assert.equal(t.description, 'new rules')
    } finally {
      await server.stop()
    }
  })

  test('history survives a restart (fresh app, same DB)', async () => {
    const app1 = createApp(ctx.store)
    const created = (await (
      await app1.request('/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 't' }),
      })
    ).json()) as Channel
    const token = created.token
    await app1.request(`/channels/${created.channelId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ from: 'a', text: 'persisted' }),
    })
    // "Restart": a brand-new app (fresh buses + presence) on the same store/DB.
    const app2 = createApp(ctx.store)
    const res = await app2.request(`/channels/${created.channelId}/messages?since=0`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await res.json()) as { messages: { text: string }[] }
    assert.deepEqual(body.messages.map(m => m.text), ['persisted'])
  })
})
