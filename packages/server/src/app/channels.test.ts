import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { createAttachmentStore } from '../attachments.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { createChannel, postJson } from './test-helpers.ts'

// Non-streaming channel HTTP. SSE (replay + live fan-out) lives in
// channel-stream.test.ts, which needs a real socket; everything here runs over
// app.request against a fresh in-memory store.
const JSON_CT = { 'content-type': 'application/json' }

describe('server HTTP — channel room', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('auth gating: bearer token + required fields', async () => {
    const app = createApp(ctx.store)
    const { channelId, auth } = await createChannel(app)
    const msgs = `/channels/${channelId}/messages`
    assert.equal((await postJson(app, msgs, { text: 'x' })).status, 401) // no token
    assert.equal((await postJson(app, msgs, { text: 'x' }, { authorization: 'Bearer nope' })).status, 401)
    assert.equal((await postJson(app, '/channels/missing/messages', { text: 'x' }, auth)).status, 404)
    assert.equal((await postJson(app, msgs, {}, auth)).status, 400) // missing text
    assert.equal((await app.request(`/channels/${channelId}/members`)).status, 401) // no token
  })

  test('messages: addressing (?for) + poll (since)', async () => {
    const app = createApp(ctx.store)
    const { channelId, auth } = await createChannel(app)
    const msgs = `/channels/${channelId}/messages`
    assert.equal((await postJson(app, msgs, { from: 'bob', text: 'hello all' }, auth)).status, 201) // seq 1, broadcast
    await postJson(app, msgs, { from: 'carol', text: 'psst', to: ['alice'] }, auth) // seq 2 → alice
    const texts = async (q: string) =>
      ((await (await app.request(`${msgs}?${q}`, { headers: auth })).json()) as { messages: { text: string }[] }).messages.map(m => m.text)

    assert.deepEqual(await texts('since=0&for=alice'), ['hello all', 'psst']) // broadcast + to-alice
    assert.deepEqual(await texts('since=0&for=dan'), ['hello all']) // broadcast only
    const since1 = (await (await app.request(`${msgs}?since=1`, { headers: auth })).json()) as {
      messages: { seq: number }[]
    }
    assert.deepEqual(since1.messages.map(m => m.seq), [2]) // strictly after the cursor
  })

  test('membership: join shows kind, activity touches roster, leave removes', async () => {
    const app = createApp(ctx.store)
    const { channelId, auth } = await createChannel(app)
    const roster = async () =>
      ((await (await app.request(`/channels/${channelId}/members`, { headers: auth })).json()) as {
        members: { name: string; kind: string }[]
      }).members

    const joined = (await (
      await app.request(`/channels/${channelId}/members/alice`, {
        method: 'PUT',
        headers: { ...auth, ...JSON_CT },
        body: JSON.stringify({ kind: 'human' }),
      })
    ).json()) as { members: { name: string; kind: string }[] }
    assert.deepEqual(joined.members.map(m => `${m.name}:${m.kind}`), ['alice:human'])

    // Posting as bob refreshes presence (activity touch) → roster gains bob.
    await postJson(app, `/channels/${channelId}/messages`, { from: 'bob', text: 'hi' }, auth)
    assert.deepEqual((await roster()).map(m => m.name).sort(), ['alice', 'bob'])

    // DELETE leave removes alice.
    assert.equal(
      (await app.request(`/channels/${channelId}/members/alice`, { method: 'DELETE', headers: auth })).status,
      204,
    )
    assert.deepEqual((await roster()).map(m => m.name), ['bob'])
  })

  test('JOIN claims a unique name: collision 409, free again after leave', async () => {
    const app = createApp(ctx.store)
    const { channelId, auth } = await createChannel(app)
    const member = (method: string) =>
      app.request(`/channels/${channelId}/members/alice`, { method, headers: { ...auth, ...JSON_CT }, body: '{}' })

    assert.equal((await member('PUT')).status, 200) // first claim wins
    const dup = await member('PUT')
    assert.equal(dup.status, 409) // same name, still online → rejected
    const body = (await dup.json()) as { error: string; members: { name: string }[] }
    assert.equal(body.error, 'name taken')
    assert.deepEqual(body.members.map(m => m.name), ['alice']) // roster comes back so caller can pick another
    assert.equal((await member('DELETE')).status, 204) // alice leaves → name freed
    assert.equal((await member('PUT')).status, 200) // reclaimable
  })

  test('DELETE /channels/:id: token-gated, removes the room', async () => {
    const app = createApp(ctx.store)
    const { channelId, auth } = await createChannel(app)
    await postJson(app, `/channels/${channelId}/messages`, { from: 'a', text: 'x' }, auth)
    const del = (headers: Record<string, string>) =>
      app.request(`/channels/${channelId}`, { method: 'DELETE', headers })

    assert.equal((await del({ authorization: 'Bearer nope' })).status, 401) // bad token can't delete
    assert.equal((await del(auth)).status, 204) // deleted
    // Gone: a follow-up GET 404s, and a double-delete 404s (guard rejects first).
    assert.equal((await app.request(`/channels/${channelId}`, { headers: auth })).status, 404)
    assert.equal((await del(auth)).status, 404)
  })

  test('self-describing: manifest (token-gated) + /channels/help (no auth)', async () => {
    const app = createApp(ctx.store)
    // Protocol help: reachable with NO token (a fresh invitee can read it).
    const help = await app.request('/channels/help')
    assert.equal(help.status, 200)
    assert.match(help.headers.get('content-type') ?? '', /text\/markdown/)
    assert.match(await help.text(), /baton channel — protocol/)

    // Create with a description; the create response points at the help.
    const created = (await (
      await postJson(app, '/channels', { title: 'sync', description: 'where alice + bob plan' })
    ).json()) as { channelId: string; token: string; help: string }
    assert.equal(created.help, '/channels/help')
    const auth = { authorization: `Bearer ${created.token}` }

    assert.equal((await app.request(`/channels/${created.channelId}`)).status, 401) // manifest token-gated

    // Join, then the manifest reflects description + online roster + help.
    await app.request(`/channels/${created.channelId}/members/alice`, {
      method: 'PUT',
      headers: { ...auth, ...JSON_CT },
      body: JSON.stringify({ kind: 'human' }),
    })
    const m = (await (await app.request(`/channels/${created.channelId}`, { headers: auth })).json()) as {
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
  })

  test('PATCH /channels/:id updates topic; token-gated; manifest reflects it', async () => {
    const app = createApp(ctx.store)
    const { channelId, auth } = await createChannel(app, { description: 'old rules' })
    const patch = (body: unknown, headers: Record<string, string>) =>
      app.request(`/channels/${channelId}`, { method: 'PATCH', body: JSON.stringify(body), headers })

    assert.equal((await patch({ description: 'x' }, JSON_CT)).status, 401) // no token
    assert.equal((await patch({ description: 'x' }, { authorization: 'Bearer nope', ...JSON_CT })).status, 401)
    assert.equal(
      (await app.request('/channels/missing-id', { method: 'PATCH', body: '{"description":"x"}', headers: { ...auth, ...JSON_CT } })).status,
      404, // unknown channel
    )
    assert.equal((await patch({}, { ...auth, ...JSON_CT })).status, 400) // empty patch

    const ok = await patch({ title: 'sync', description: 'new rules' }, { ...auth, ...JSON_CT })
    assert.equal(ok.status, 200)
    const updated = (await ok.json()) as { description?: string; token?: string }
    assert.equal(updated.description, 'new rules')
    assert.equal(updated.token, undefined)

    const m = (await (await app.request(`/channels/${channelId}`, { headers: auth })).json()) as {
      title?: string
      description?: string
    }
    assert.equal(m.title, 'sync')
    assert.equal(m.description, 'new rules')

    // Updating only one field leaves the other untouched.
    const t = (await (await patch({ title: 'renamed' }, { ...auth, ...JSON_CT })).json()) as {
      title?: string
      description?: string
    }
    assert.equal(t.title, 'renamed')
    assert.equal(t.description, 'new rules')
  })

  test('history survives a restart (fresh app, same DB)', async () => {
    const app1 = createApp(ctx.store)
    const { channelId, token } = await createChannel(app1, { title: 't' })
    await postJson(app1, `/channels/${channelId}/messages`, { from: 'a', text: 'persisted' }, {
      authorization: `Bearer ${token}`,
    })
    // "Restart": a brand-new app (fresh buses + presence) on the same store/DB.
    const app2 = createApp(ctx.store)
    const res = await app2.request(`/channels/${channelId}/messages?since=0`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const body = (await res.json()) as { messages: { text: string }[] }
    assert.deepEqual(body.messages.map(m => m.text), ['persisted'])
  })

  test('attachments: upload → download (token-gated), cleaned on room delete', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'baton-chan-att-'))
    const attachments = createAttachmentStore(dir)
    const app = createApp(ctx.store, undefined, undefined, undefined, undefined, attachments)
    const { channelId, auth } = await createChannel(app)
    const base = `/channels/${channelId}/attachments`

    // Upload: the raw body IS the file; filename rides ?filename.
    const up = await app.request(`${base}?filename=hi.txt`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'text/plain' },
      body: 'hello channel',
    })
    assert.equal(up.status, 201)
    const meta = (await up.json()) as { id: string; channelId: string; url: string; filename: string; size: number }
    assert.equal(meta.channelId, channelId)
    assert.equal(meta.filename, 'hi.txt')
    assert.equal(meta.url, `${base}/${meta.id}`)
    assert.equal(meta.size, Buffer.byteLength('hello channel'))
    assert.equal((await app.request(`${base}?filename=x`, { method: 'POST', body: 'x' })).status, 401) // upload token-gated

    // Download: streams the bytes back, with the filename in content-disposition.
    const dl = await app.request(meta.url, { headers: auth })
    assert.equal(dl.status, 200)
    assert.match(dl.headers.get('content-disposition') ?? '', /hi\.txt/)
    assert.equal(await dl.text(), 'hello channel')
    assert.equal((await app.request(meta.url)).status, 401) // download token-gated
    assert.equal((await app.request(`${base}/missing`, { headers: auth })).status, 404)

    // Deleting the room cascade-cleans its blobs from disk.
    assert.notEqual(await attachments.get(channelId, meta.id), null) // present before
    await app.request(`/channels/${channelId}`, { method: 'DELETE', headers: auth })
    assert.equal(await attachments.get(channelId, meta.id), null) // forgotten after
    await rm(dir, { recursive: true, force: true })
  })
})
