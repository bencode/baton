import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { startServer } from '../server.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import type { WithId } from './test-helpers.ts'

describe('server HTTP — SSE chat stream', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('replays history then pushes new events as they arrive', async () => {
    const server = await startServer({ store: ctx.store, port: 0 })
    try {
      const base = `http://localhost:${server.port}`
      const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${base}${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json', ...headers },
        })
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
