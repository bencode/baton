import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { startServer } from '../server.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import type { WithId } from './test-helpers.ts'

// Read from an SSE reader until `n` `data:` frames seen or `ms` elapses. Races
// each read against a deadline so a quiet stream can't hang the test.
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

describe('server HTTP — SSE chat stream', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('replays persisted history on connect, then tails live; ?live=1 skips replay', async () => {
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
      const reg = (await (
        await post('/workers', {
          projectId: p.id,
          machineId: 'mid-sse',
          name: 'sse-worker',
          hostname: 'h-sse',
        })
      ).json()) as { worker: WithId; apiToken: string }
      const s = (await (
        await post('/sessions', { projectId: p.id, workerId: reg.worker.id, name: 'sse-test' })
      ).json()) as WithId
      // Mark active (as the worker would on spawn) so messages aren't 409-gated.
      await post(
        `/sessions/${s.id}/status`,
        { active: true },
        { authorization: `Bearer ${reg.apiToken}` },
      )
      await ctx.store.sessions.materialize(s.id, {
        agentSessionId: 'uuid',
        worktreePath: '/tmp/sse-test',
      })
      // Queue invalidations are durable; submission does not fabricate a message.
      await post(`/sessions/${s.id}/messages`, { text: 'pre' })

      // (A) full stream replays the pre-connect invalidation.
      const ctlA = new AbortController()
      try {
        const res = await fetch(`${base}/sessions/${s.id}/stream`, {
          signal: ctlA.signal,
          headers: { accept: 'text/event-stream' },
        })
        assert.equal(res.status, 200)
        const reader = res.body?.getReader()
        assert.ok(reader)
        const chunk = await readUntil(reader, 1, 1500)
        assert.match(chunk, /"type":"queue_changed"/)
        assert.match(chunk, /"revision":1/)
        assert.doesNotMatch(chunk, /"type":"user_message"/)
      } finally {
        ctlA.abort()
      }

      // (B) ?live=1 skips replay: only a message sent after connect arrives.
      const ctlB = new AbortController()
      try {
        const res = await fetch(`${base}/sessions/${s.id}/stream?live=1`, {
          signal: ctlB.signal,
          headers: { accept: 'text/event-stream' },
        })
        const reader = res.body?.getReader()
        assert.ok(reader)
        // The POST round-trip outlasts the server's subscribe, so it's delivered live.
        await post(`/sessions/${s.id}/messages`, { text: 'live' })
        const chunk = await readUntil(reader, 1, 1500)
        assert.match(chunk, /"revision":2/)
        assert.doesNotMatch(chunk, /"revision":1/)
        const claim = await post(
          `/sessions/${s.id}/turns/claim`,
          { claimId: 'sse-test', runnerToken: 'runner' },
          { authorization: `Bearer ${reg.apiToken}` },
        )
        assert.equal(claim.status, 200)
        const execution = await readUntil(reader, 3, 1500)
        const events = execution
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => JSON.parse(line.slice(5)) as { type: string; payload: { text?: string } })
        assert.deepEqual(
          events.map(event => event.type),
          ['user_message', 'queue_changed', 'turn_start'],
        )
        assert.equal(events[0]?.payload.text, 'pre\n\nlive')
      } finally {
        ctlB.abort()
      }
    } finally {
      await server.stop()
    }
  })
})
