import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
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

describe('server HTTP — relay channel', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('create → token-gated post → SSE replay + live tail', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json', ...headers },
        })

      // Create a channel (no auth).
      const ch = (await (await post('/relay/channels', {})).json()) as {
        channelId: string
        token: string
      }
      assert.ok(ch.channelId && ch.token)
      const auth = { authorization: `Bearer ${ch.token}` }
      const msgs = `/relay/channels/${ch.channelId}/messages`

      // Auth gating on post.
      assert.equal((await post(msgs, { text: 'x' })).status, 401) // no token
      assert.equal((await post(msgs, { text: 'x' }, { authorization: 'Bearer nope' })).status, 401)
      assert.equal(
        (await post('/relay/channels/missing/messages', { text: 'x' }, auth)).status,
        404,
      )
      assert.equal((await post(msgs, {}, auth)).status, 400) // missing text

      // Persisted before any subscriber connects — part of replay history.
      assert.equal((await post(msgs, { from: 'alice', text: 'pre' }, auth)).status, 201)

      // Bad token on the stream is rejected too.
      const badStream = await fetch(`${base}/relay/channels/${ch.channelId}/stream`, {
        headers: { authorization: 'Bearer nope', accept: 'text/event-stream' },
      })
      assert.equal(badStream.status, 401)

      // Subscribe: replays 'pre', then tails a live message.
      const ctl = new AbortController()
      try {
        const res = await fetch(`${base}/relay/channels/${ch.channelId}/stream`, {
          signal: ctl.signal,
          headers: { ...auth, accept: 'text/event-stream' },
        })
        assert.equal(res.status, 200)
        const reader = res.body?.getReader()
        assert.ok(reader)
        assert.match(await readUntil(reader, 1, 1500), /"text":"pre"/)
        await post(msgs, { from: 'bob', text: 'live' }, auth)
        assert.match(await readUntil(reader, 2, 1500), /"text":"live"/)
      } finally {
        ctl.abort()
      }
    } finally {
      await server.stop()
    }
  })
})
