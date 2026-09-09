import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { ClaimedExecution, SubmitInputResult } from '@baton/shared'
import { createApp } from '../app.ts'
import { createCommandBus } from '../command-bus.ts'
import { freshStore } from '../store/test-db.ts'
import { postJson, seedSession } from './test-helpers.ts'

test('Queue HTTP contract: delete, one interrupt drains both pending inputs, ownership and attempt fencing', async () => {
  const ctx = await freshStore()
  const commands = createCommandBus()
  const app = createApp(ctx.store, { commands })
  const { session, workerId, workerToken, projectId } = await seedSession(app)
  const off = commands.subscribe(workerId, () => {})
  const base = `/sessions/${session.id}`
  const auth = { authorization: `Bearer ${workerToken}` }
  try {
    await ctx.store.sessions.materialize(session.id, {
      agentSessionId: 'uuid',
      worktreePath: '/tmp/s',
    })
    const submit = async (text: string) => {
      const response = await postJson(app, `${base}/messages`, { text, replyExpected: true })
      assert.equal(response.status, 201)
      return (await response.json()) as SubmitInputResult
    }
    const claim = async () => {
      const response = await postJson(
        app,
        `${base}/turns/claim`,
        { claimId: randomUUID(), runnerToken: 'runner' },
        auth,
      )
      assert.equal(response.status, 200)
      const execution = (await response.json()) as ClaimedExecution
      assert.equal(execution.kind, 'execute')
      return execution
    }
    assert.equal((await postJson(app, `${base}/turns/claim`, null, auth)).status, 400)
    assert.equal(
      (await postJson(app, `${base}/attempts/not-an-id/heartbeat`, { runnerToken: 'runner' }, auth))
        .status,
      400,
    )
    const initial = await submit('current')
    assert.equal(initial.queue.items.length, 1)
    const first = await claim()
    const a = await submit('A')
    const b = await submit('B')
    const discard = await submit('discard')
    const deleted = await app.request(`${base}/queue/${discard.input.id}`, { method: 'DELETE' })
    assert.equal(deleted.status, 200)
    assert.equal(((await deleted.json()) as { removed: boolean }).removed, true)
    assert.equal(
      (
        (await (
          await app.request(`${base}/queue/${discard.input.id}`, { method: 'DELETE' })
        ).json()) as { removed: boolean }
      ).removed,
      false,
    )
    await postJson(app, `${base}/abort`, {})
    const result = await postJson(
      app,
      `${base}/attempts/${first.attempt.id}/finish`,
      { runnerToken: 'runner', outcome: 'completed' },
      auth,
    )
    assert.equal(((await result.json()) as { outcome: string }).outcome, 'aborted')
    const second = await claim()
    assert.equal(second.message.payload.text, 'A\n\nB')
    assert.deepEqual(second.message.payload.inputIds, [a.input.id, b.input.id])
    assert.equal(second.message.payload.replyInputId, b.input.id)
    assert.equal(
      (
        await postJson(
          app,
          `${base}/attempts/${first.attempt.id}/events`,
          { runnerToken: 'runner', type: 'agent_event', payload: {} },
          auth,
        )
      ).status,
      409,
    )
    assert.equal(
      (await postJson(app, `${base}/turns/claim`, { claimId: 'x', runnerToken: 'x' })).status,
      401,
    )
    const other = await ctx.store.workers.register({
      projectId,
      machineId: 'other',
      name: 'other',
      hostname: 'other',
    })
    assert.notEqual(other.kind, 'name-collision')
    if (other.kind === 'name-collision') throw new Error('unexpected collision')
    assert.equal(
      (
        await postJson(
          app,
          `${base}/turns/claim`,
          { claimId: 'x', runnerToken: 'x' },
          { authorization: `Bearer ${other.apiToken}` },
        )
      ).status,
      403,
    )
    assert.equal((await postJson(app, `${base}/events`, { type: 'turn_start' }, auth)).status, 404)
    const materialize = await app.request(base, {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ agentSessionId: 'stale', worktreePath: '/tmp/s' }),
    })
    assert.equal(materialize.status, 409)
    assert.equal(((await (await app.request(base)).json()) as { busy: boolean }).busy, true)
    assert.equal((await postJson(app, `${base}/terminal`, { action: 'open' })).status, 409)
    const done = { runnerToken: 'runner', outcome: 'completed' }
    assert.equal(
      (await postJson(app, `${base}/attempts/${second.attempt.id}/finish`, done, auth)).status,
      200,
    )
    assert.equal(
      (await postJson(app, `${base}/attempts/${second.attempt.id}/finish`, done, auth)).status,
      200,
    )
    assert.equal(((await (await app.request(base)).json()) as { busy: boolean }).busy, false)
  } finally {
    off()
    await ctx.cleanup()
  }
})
