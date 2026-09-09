import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ClaimedExecution } from '@baton/shared'
import { type ContractCtx, newCtx, seedReq, seedWorker } from './helpers.ts'

describe('Session execution contract', () => {
  let ctx: ContractCtx
  let sessionId: number
  beforeEach(async () => {
    ctx = await newCtx()
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const session = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 'execution',
      agentKind: 'codex',
    })
    sessionId = session.id
    await ctx.store.sessions.materialize(sessionId, {
      agentSessionId: 'pending:test',
      worktreePath: '/tmp/test',
    })
  })
  afterEach(async () => {
    await ctx.cleanup()
  })
  const claim = async (runnerToken = 'runner'): Promise<ClaimedExecution> => {
    const result = await ctx.store.turns.claim(sessionId, { claimId: randomUUID(), runnerToken })
    assert.equal(result.value.kind, 'execute')
    return result.value as ClaimedExecution
  }

  test('claim consumes one compatible batch atomically; cancellation only affects pending input', async () => {
    const a = await ctx.store.inputs.submit(sessionId, { text: 'A', replyExpected: true })
    const b = await ctx.store.inputs.submit(sessionId, { text: 'B', replyExpected: true })
    const c = await ctx.store.inputs.submit(sessionId, { text: 'cancel' })
    assert.equal(
      (await ctx.store.sessions.listEvents(sessionId)).some(e => e.type === 'user_message'),
      false,
    )
    assert.equal((await ctx.store.inputs.cancel(sessionId, c.value.input.id)).value.removed, true)
    const first = await claim()
    assert.equal(first.message.payload.text, 'A\n\nB')
    assert.deepEqual(first.message.payload.inputIds, [a.value.input.id, b.value.input.id])
    assert.equal(first.message.payload.replyInputId, b.value.input.id)
    assert.equal((await ctx.store.inputs.list(sessionId)).items.length, 0)
    assert.equal((await ctx.store.inputs.cancel(sessionId, a.value.input.id)).value.removed, false)
    const repeat = await ctx.store.turns.claim(sessionId, {
      claimId: first.attempt.claimId,
      runnerToken: 'runner',
    })
    assert.equal(repeat.events.length, 0)
    assert.equal(repeat.value.kind, 'execute')
    const done = { runnerToken: 'runner', outcome: 'completed' as const, message: '' }
    await ctx.store.turns.finish(sessionId, first.attempt.id, done)
    assert.equal((await ctx.store.turns.finish(sessionId, first.attempt.id, done)).events.length, 0)
    assert.equal(
      (
        await ctx.store.turns.claim(sessionId, {
          claimId: first.attempt.claimId,
          runnerToken: 'runner',
        })
      ).value.kind,
      'settled',
    )
    assert.equal(
      (await ctx.store.sessions.listEvents(sessionId)).filter(e => e.type === 'user_message')
        .length,
      1,
    )
  })

  test('loop replacement preserves manual inputs, other loops, FIFO and claimed work', async () => {
    const old = await ctx.store.inputs.submit(sessionId, { text: 'same', loopId: 1 })
    const manual = await ctx.store.inputs.submit(sessionId, { text: 'same' })
    const other = await ctx.store.inputs.submit(sessionId, { text: 'same', loopId: 2 })
    await ctx.store.sessions.setPlanMode(sessionId, true)
    const latest = await ctx.store.inputs.submit(sessionId, { text: 'latest', loopId: 1 })
    assert.deepEqual(
      latest.value.queue.items.map(input => input.id),
      [manual.value.input.id, other.value.input.id, latest.value.input.id],
    )
    assert.equal(latest.value.input.planMode, true)
    assert.equal('loopId' in latest.value.input, false)
    assert.equal(latest.value.queue.revision, other.value.queue.revision + 1)
    assert.deepEqual(
      latest.events.map(event => event.payload),
      [
        {
          revision: latest.value.queue.revision,
          addedIds: [latest.value.input.id],
          cancelledIds: [old.value.input.id],
        },
      ],
    )
    const first = await claim()
    assert.deepEqual(first.message.payload.inputIds, [manual.value.input.id, other.value.input.id])
    await ctx.store.turns.finish(sessionId, first.attempt.id, {
      runnerToken: 'runner',
      outcome: 'completed',
    })
    const running = await claim()
    assert.deepEqual(running.message.payload.inputIds, [latest.value.input.id])
    const next = await ctx.store.inputs.submit(sessionId, { text: 'next', loopId: 1 })
    assert.deepEqual(
      next.value.queue.items.map(input => input.id),
      [next.value.input.id],
    )
    assert.equal((await ctx.store.turns.state(sessionId)).attempt?.id, running.attempt.id)
    assert.equal((await ctx.store.turns.state(sessionId)).attempt?.status, 'running')
    await ctx.store.turns.finish(sessionId, running.attempt.id, {
      runnerToken: 'runner',
      outcome: 'completed',
    })
    assert.deepEqual((await claim()).message.payload.inputIds, [next.value.input.id])
  })

  test('configuration changes preserve FIFO batch boundaries', async () => {
    await ctx.store.inputs.submit(sessionId, { text: 'A' })
    await ctx.store.sessions.setPlanMode(sessionId, true)
    await ctx.store.inputs.submit(sessionId, { text: 'B' })
    const first = await claim()
    assert.equal(first.message.payload.text, 'A')
    await ctx.store.turns.finish(sessionId, first.attempt.id, {
      runnerToken: 'runner',
      outcome: 'completed',
    })
    const next = await claim()
    assert.equal(next.message.payload.text, 'B')
    assert.equal(next.message.payload.planMode, true)
  })

  test('stop and clear preserve queue; late completion cannot undo an interrupt', async () => {
    await ctx.store.inputs.submit(sessionId, { text: 'running' })
    const first = await claim()
    await ctx.store.inputs.submit(sessionId, { text: 'next' })
    await ctx.store.turns.control(sessionId, 'session_stop')
    const done = await ctx.store.turns.finish(sessionId, first.attempt.id, {
      runnerToken: 'runner',
      outcome: 'completed',
    })
    assert.equal(done.value.outcome, 'aborted')
    await ctx.store.turns.control(sessionId, 'context_clear')
    assert.equal((await ctx.store.turns.state(sessionId)).paused, true)
    assert.equal(
      (await ctx.store.turns.claim(sessionId, { claimId: randomUUID(), runnerToken: 'runner' }))
        .value.kind,
      'idle',
    )
    await ctx.store.turns.control(sessionId, 'resume')
    assert.equal((await claim()).message.payload.text, 'next')
  })

  test('expired lease stays fenced until stopped; at most three retries with one user message', async () => {
    await ctx.store.inputs.submit(sessionId, { text: 'retry' })
    let current = await claim()
    const turnId = current.turn.id
    for (let number = 1; number <= 4; number++) {
      assert.equal(current.attempt.number, number)
      await ctx.store.turns.expire(sessionId, current.attempt.leaseUntil + 1)
      await assert.rejects(
        ctx.store.turns.event(sessionId, current.attempt.id, 'runner', 'agent_event', {}),
      )
      assert.equal(
        (await ctx.store.turns.claim(sessionId, { claimId: randomUUID(), runnerToken: 'new' }))
          .value.kind,
        'idle',
      )
      const stopped = await ctx.store.turns.stopped(sessionId, current.attempt.id, 'runner')
      assert.equal(stopped.value.retrying === true, number < 4)
      if (number < 4) {
        current = await claim()
        assert.equal(current.turn.id, turnId)
      }
    }
    assert.equal((await ctx.store.turns.state(sessionId)).turn, null)
    assert.equal(
      (await ctx.store.sessions.listEvents(sessionId)).filter(e => e.type === 'user_message')
        .length,
      1,
    )
  })

  test('concurrent claims and cancellation cannot duplicate or lose an input', async () => {
    const input = await ctx.store.inputs.submit(sessionId, { text: 'race' })
    const [a, b, cancelled] = await Promise.all([
      ctx.store.turns.claim(sessionId, { claimId: randomUUID(), runnerToken: 'a' }),
      ctx.store.turns.claim(sessionId, { claimId: randomUUID(), runnerToken: 'b' }),
      ctx.store.inputs.cancel(sessionId, input.value.input.id),
    ])
    const executed = [a, b].filter(r => r.value.kind === 'execute').length
    assert.equal(executed + Number(cancelled.value.removed), 1)
    assert.equal((await ctx.store.inputs.list(sessionId)).items.length, 0)
  })
})

describe('Session clear and timeout boundaries', () => {
  test('clear defers provider reset until the current attempt settles, preserving pending input', async () => {
    const ctx = await newCtx()
    try {
      const { project } = await seedReq(ctx)
      const workerId = await seedWorker(ctx, project)
      const session = await ctx.store.sessions.create({
        projectId: project,
        workerId,
        mode: 'worker',
        name: 'clear',
        agentKind: 'codex',
      })
      await ctx.store.sessions.materialize(session.id, {
        agentSessionId: 'old-thread',
        worktreePath: '/tmp/clear',
      })
      await ctx.store.inputs.submit(session.id, { text: 'current' })
      const first = await ctx.store.turns.claim(session.id, { claimId: 'clear', runnerToken: 'r' })
      if (first.value.kind !== 'execute') throw new Error('expected execution')
      await ctx.store.inputs.submit(session.id, { text: 'next' })
      await ctx.store.turns.control(session.id, 'context_clear')
      assert.equal((await ctx.store.sessions.get(session.id))?.agentSessionId, 'old-thread')
      assert.equal((await ctx.store.turns.state(session.id)).contextResetRequested, true)
      await ctx.store.turns.finish(session.id, first.value.attempt.id, {
        runnerToken: 'r',
        outcome: 'completed',
      })
      const next = await ctx.store.turns.claim(session.id, { claimId: 'next', runnerToken: 'r' })
      if (next.value.kind !== 'execute') throw new Error('expected next execution')
      assert.match(next.value.config.agentSessionId, /^pending:/)
      assert.equal(next.value.message.payload.text, 'next')
      await ctx.store.turns.heartbeat(session.id, next.value.attempt.id, 'r', 'timeout')
      const timedOut = await ctx.store.turns.stopped(session.id, next.value.attempt.id, 'r')
      assert.deepEqual(timedOut.value, { outcome: 'failed', message: 'timeout' })
      assert.equal((await ctx.store.turns.state(session.id)).turn, null)
    } finally {
      await ctx.cleanup()
    }
  })
})
