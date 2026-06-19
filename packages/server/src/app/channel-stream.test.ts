import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { startServer } from '../server.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { readUntil } from './test-helpers.ts'

// SSE needs a real socket (incremental body reads + live push), so these run over
// startServer rather than app.request. Non-streaming channel HTTP lives in
// channels.test.ts.
type Channel = { channelId: string; token: string }

describe('server SSE — channel stream', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('bad token rejected; two subscribers replay history, then both get live', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json', ...headers },
        })
      const ch = (await (await post('/channels', {})).json()) as Channel
      const auth = { authorization: `Bearer ${ch.token}` }
      const msgs = `/channels/${ch.channelId}/messages`
      await post(msgs, { from: 'bob', text: 'hello all' }, auth) // seq 1, broadcast
      await post(msgs, { from: 'carol', text: 'psst', to: ['alice'] }, auth) // seq 2

      // Bad token is rejected before any streaming happens.
      assert.equal(
        (
          await fetch(`${base}/channels/${ch.channelId}/stream`, {
            headers: { authorization: 'Bearer nope', accept: 'text/event-stream' },
          })
        ).status,
        401,
      )

      // Two subscribers both replay 'psst' (seq>1), then both receive a live message.
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
})
