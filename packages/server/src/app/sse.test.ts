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

  test('pushes new events as they arrive (no history replay — events live on the client)', async () => {
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
      const workerReg = (await (
        await post('/workers', {
          projectId: p.id,
          machineId: 'mid-sse',
          name: 'sse-worker',
          hostname: 'h-sse',
        })
      ).json()) as { worker: WithId; apiToken: string }
      const s = (await (
        await post('/sessions', {
          projectId: p.id,
          workerId: workerReg.worker.id,
          name: 'sse-test',
        })
      ).json()) as WithId
      // Mark active (as the worker would on spawn) so messages aren't 409-gated.
      await post(
        `/sessions/${s.id}/status`,
        { active: true },
        { authorization: `Bearer ${workerReg.apiToken}` },
      )
      // A pre-connect message is dropped — there's no longer any server-side
      // history to replay; clients keep their own transcript in IndexedDB.
      await post(`/sessions/${s.id}/messages`, { text: 'pre' })

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

      // New live event arrives.
      await post(`/sessions/${s.id}/messages`, { text: 'live' })
      const chunk = await readUntil(1, 1500)
      assert.match(chunk, /"text":"live"/)
      // Pre-connect message must NOT appear.
      assert.doesNotMatch(chunk, /"text":"pre"/)

      controller.abort()
      await reader.cancel().catch(() => {})
    } finally {
      await server.stop()
    }
  })
})
