import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { Attachment } from '@baton/shared'
import { createApp } from '../app.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, seedSession } from './test-helpers.ts'

describe('server HTTP — attachments', () => {
  let ctx: TestStore
  let dataDir: string
  let prevDataDir: string | undefined
  beforeEach(async () => {
    ctx = await freshStore()
    dataDir = mkdtempSync(join(tmpdir(), 'baton-att-'))
    prevDataDir = process.env.BATON_DATA_DIR
    process.env.BATON_DATA_DIR = dataDir
  })
  afterEach(async () => {
    await ctx.cleanup()
    rmSync(dataDir, { recursive: true, force: true })
    if (prevDataDir === undefined) delete process.env.BATON_DATA_DIR
    else process.env.BATON_DATA_DIR = prevDataDir
  })

  test('upload (raw body) → descriptor; download streams bytes back', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const bytes = new TextEncoder().encode('hello-file')

    const up = await app.request(`/sessions/${session.id}/attachments?filename=hi.txt`, {
      method: 'POST',
      body: bytes,
      headers: { 'content-type': 'text/plain' },
    })
    assert.equal(up.status, 201)
    const meta = (await up.json()) as Attachment
    assert.equal(meta.filename, 'hi.txt')
    assert.equal(meta.contentType, 'text/plain')
    assert.equal(meta.size, bytes.byteLength)
    assert.equal(meta.sessionId, session.id)
    assert.equal(meta.url, `/sessions/${session.id}/attachments/${meta.id}`)

    const dl = await app.request(meta.url)
    assert.equal(dl.status, 200)
    assert.equal(dl.headers.get('content-type'), 'text/plain')
    assert.equal(await dl.text(), 'hello-file')
  })

  test('non-ASCII filename downloads without throwing (RFC 5987 content-disposition)', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const name = '杭州方案.txt'
    const up = await app.request(
      `/sessions/${session.id}/attachments?filename=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        body: new TextEncoder().encode('hi'),
        headers: { 'content-type': 'text/plain' },
      },
    )
    const meta = (await up.json()) as Attachment
    assert.equal(meta.filename, name)
    const dl = await app.request(meta.url)
    assert.equal(dl.status, 200)
    assert.equal(await dl.text(), 'hi')
    const cd = dl.headers.get('content-disposition') ?? ''
    assert.match(cd, /filename\*=UTF-8''/)
    assert.ok(cd.includes(encodeURIComponent(name)))
  })

  test("filename* percent-encodes RFC 5987 non-attr chars ('()*)", async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const name = "it's (v2)*.pdf"
    const up = await app.request(
      `/sessions/${session.id}/attachments?filename=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        body: new TextEncoder().encode('x'),
        headers: { 'content-type': 'application/pdf' },
      },
    )
    const meta = (await up.json()) as Attachment
    const dl = await app.request(meta.url)
    const cd = dl.headers.get('content-disposition') ?? ''
    const ext = cd.split("filename*=UTF-8''")[1] ?? ''
    // none of ' ( ) * survive literally in the ext-value
    assert.doesNotMatch(ext, /['()*]/)
    assert.ok(ext.includes('%27') && ext.includes('%28') && ext.includes('%2A'))
  })

  test('upload to missing session → 404; unknown attachment → 404', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const miss = await app.request('/sessions/999999/attachments?filename=x', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
      headers: { 'content-type': 'application/octet-stream' },
    })
    assert.equal(miss.status, 404)
    const dl = await app.request(`/sessions/${session.id}/attachments/nope`)
    assert.equal(dl.status, 404)
  })

  test('message carries attachment descriptors in its payload', async () => {
    const app = createApp(ctx.store)
    const { session, workerToken } = await seedSession(app)
    // messages require an active session
    await postJson(
      app,
      `/sessions/${session.id}/status`,
      { active: true },
      {
        authorization: `Bearer ${workerToken}`,
      },
    )
    const up = await app.request(`/sessions/${session.id}/attachments?filename=a.png`, {
      method: 'POST',
      body: new Uint8Array([1, 2, 3, 4]),
      headers: { 'content-type': 'image/png' },
    })
    const meta = (await up.json()) as Attachment

    // with text
    const res = await postJson(app, `/sessions/${session.id}/messages`, {
      text: 'look at this',
      attachments: [meta],
    })
    assert.equal(res.status, 201)
    const ev = (await res.json()) as { payload: { text: string; attachments: Attachment[] } }
    assert.deepEqual(ev.payload.attachments, [meta])

    // attachments-only (no text) is valid
    const only = await postJson(app, `/sessions/${session.id}/messages`, { attachments: [meta] })
    assert.equal(only.status, 201)

    // still rejects truly empty
    assert.equal((await postJson(app, `/sessions/${session.id}/messages`, {})).status, 400)
  })

  test('forgetSession on DELETE removes attachment (download → 404)', async () => {
    const app = createApp(ctx.store)
    const { session } = await seedSession(app)
    const up = await app.request(`/sessions/${session.id}/attachments?filename=z.bin`, {
      method: 'POST',
      body: new Uint8Array([9]),
      headers: { 'content-type': 'application/octet-stream' },
    })
    const meta = (await up.json()) as Attachment
    await app.request(`/sessions/${session.id}`, { method: 'DELETE' })
    const dl = await app.request(meta.url)
    assert.equal(dl.status, 404)
  })
})
