import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { AgentKind, ClaimedExecution, Loop } from '@baton/shared'
import { type ContractCtx, newCtx, seedReq, seedWorker } from './helpers.ts'

const now = 1_800_000_000_000

describe('Loop context clearing', () => {
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
      name: 'collector',
      agentKind: 'claude-code',
    })
    sessionId = session.id
    await ctx.store.sessions.materialize(sessionId, {
      agentSessionId: 'original',
      cwd: '/tmp/collect',
    })
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  const createLoop = (clearEveryRuns = 1, runsSinceClear = 0) =>
    ctx.store.loops
      .create({ sessionId, message: 'collect', intervalSec: 60, nextRunAt: now, clearEveryRuns })
      .then(loop => (runsSinceClear ? ctx.store.loops.update(loop.id, { runsSinceClear }) : loop))
  const send = (loop: Loop, allowContextClear = true) =>
    ctx.store.inputs.submit(
      sessionId,
      { text: loop.message, loopId: loop.id },
      { allowContextClear },
    )
  // Delivered but never run: drop the queued beat so the session is idle again.
  const sendAndDrop = async (loop: Loop) => {
    const sent = await send(loop)
    await ctx.store.inputs.cancel(sessionId, sent.value.input.id)
    return sent
  }
  const runs = async (loop: Loop) => (await ctx.store.loops.get(loop.id))?.runsSinceClear
  const claim = async () => {
    const result = await ctx.store.turns.claim(sessionId, {
      claimId: randomUUID(),
      runnerToken: 'runner',
    })
    assert.equal(result.value.kind, 'execute')
    return result.value as ClaimedExecution
  }

  test('clears before the run after n delivered runs; claim uses the new provider conversation', async () => {
    const loop = await createLoop(2)
    for (const expected of [1, 2]) {
      const sent = await sendAndDrop(loop)
      assert.deepEqual(
        sent.events.map(e => e.type),
        ['queue_changed'],
      )
      assert.equal(await runs(loop), expected)
    }
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    const sent = await send(loop)
    assert.deepEqual(
      sent.events.map(e => e.type),
      ['system', 'queue_changed'],
    )
    assert.deepEqual(sent.events[0]?.payload, { action: 'context_cleared' })
    assert.equal(await runs(loop), 1)
    const current = await ctx.store.sessions.get(sessionId)
    assert.notEqual(current?.agentSessionId, 'original')
    assert.equal(current?.cwd, '/tmp/collect')
    assert.equal((await claim()).config.agentSessionId, current?.agentSessionId)
    assert.ok(
      (await ctx.store.sessions.listEvents(sessionId)).some(e => e.id === sent.events[0]?.id),
    )
  })

  test('pending inputs defer clearing; replacing a pending beat does not count', async () => {
    const loop = await createLoop(1, 1)
    const manual = await ctx.store.inputs.submit(sessionId, { text: 'manual instruction' })
    const first = await send(loop)
    assert.deepEqual(
      first.events.map(e => e.type),
      ['queue_changed'],
    )
    assert.equal(await runs(loop), 2)
    const replacing = await send(loop)
    assert.deepEqual(
      replacing.events.map(e => e.type),
      ['queue_changed'],
    )
    assert.equal(await runs(loop), 2)
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    assert.deepEqual(
      replacing.value.queue.items.map(i => i.id),
      [manual.value.input.id, replacing.value.input.id],
    )
  })

  test('running and recovering turns defer clearing; the next idle beat clears', async () => {
    const loop = await createLoop(1, 1)
    await ctx.store.inputs.submit(sessionId, { text: 'work' })
    const active = await claim()
    await sendAndDrop(loop)
    assert.equal((await ctx.store.turns.state(sessionId)).attempt?.status, 'running')
    await ctx.store.turns.expire(sessionId, active.attempt.leaseUntil + 1)
    await ctx.store.turns.stopped(sessionId, active.attempt.id, 'runner')
    assert.equal((await ctx.store.turns.state(sessionId)).turn?.status, 'recovering')
    await sendAndDrop(loop)
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    assert.equal(await runs(loop), 3)
    const recovered = await claim()
    await ctx.store.turns.finish(sessionId, recovered.attempt.id, {
      runnerToken: 'runner',
      outcome: 'completed',
    })
    assert.equal((await send(loop)).events[0]?.type, 'system')
  })

  test('an attached terminal or a disabled loop never clears', async () => {
    const loop = await createLoop(1, 1)
    assert.deepEqual(
      (await send(loop, false)).events.map(e => e.type),
      ['queue_changed'],
    )
    const paused = await ctx.store.loops.update(loop.id, { enabled: false })
    await ctx.store.inputs.cancel(sessionId, (await ctx.store.inputs.list(sessionId)).items[0]!.id)
    assert.deepEqual(
      (await send(paused)).events.map(e => e.type),
      ['queue_changed'],
    )
    assert.equal(await runs(loop), 2)
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
  })

  test('any context clear restarts every loop count on the session', async () => {
    const first = await createLoop(1, 1)
    const second = await createLoop(5, 3)
    await ctx.store.turns.control(sessionId, 'context_clear')
    assert.equal(await runs(first), 0)
    assert.equal(await runs(second), 0)
    await ctx.store.loops.update(first.id, { runsSinceClear: 1 })
    await ctx.store.loops.update(second.id, { runsSinceClear: 3 })
    assert.equal((await sendAndDrop(first)).events[0]?.type, 'system')
    assert.equal(await runs(first), 1)
    assert.equal(await runs(second), 0)
  })

  test('failed enqueue rolls back both clear and count', async () => {
    const loop = await createLoop(1, 1)
    // Invalid JSON data makes enqueue fail after the context reset has been attempted.
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await assert.rejects(
      ctx.store.inputs.submit(
        sessionId,
        {
          text: loop.message,
          loopId: loop.id,
          images: [circular as unknown as string],
        },
        { allowContextClear: true },
      ),
    )
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    assert.equal(await runs(loop), 1)
    assert.equal((await ctx.store.inputs.list(sessionId)).items.length, 0)
    assert.equal((await ctx.store.sessions.listEvents(sessionId)).length, 0)
  })

  for (const agentKind of ['claude-code', 'codex', 'pi'] satisfies AgentKind[]) {
    test(`${agentKind} clears to a fresh conversation and keeps a pending manual reset intact`, async () => {
      if (agentKind !== 'claude-code') {
        const existing = await ctx.store.sessions.get(sessionId)
        assert.ok(existing)
        const session = await ctx.store.sessions.create({
          projectId: existing.projectId,
          workerId: existing.workerId,
          mode: 'worker',
          name: agentKind,
          agentKind,
        })
        sessionId = session.id
      }
      const loop = await createLoop(1, 1)
      if (agentKind === 'codex') {
        assert.deepEqual(
          (await send(loop)).events.map(e => e.type),
          ['queue_changed'],
        )
        const queued = await ctx.store.inputs.list(sessionId)
        await ctx.store.inputs.cancel(sessionId, queued.items[0]!.id)
      }
      if (agentKind !== 'claude-code') {
        await ctx.store.sessions.materialize(sessionId, {
          agentSessionId: 'old-thread',
          cwd: `/tmp/${agentKind}`,
        })
      }
      await send(loop)
      const current = await ctx.store.sessions.get(sessionId)
      assert.equal(current?.agentSessionId?.startsWith('pending:'), agentKind === 'codex')
      const active = await claim()
      await ctx.store.turns.control(sessionId, 'context_clear')
      const before = current?.agentSessionId
      const sent = await send(loop)
      assert.deepEqual(
        sent.events.map(e => e.type),
        ['queue_changed'],
      )
      assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, before)
      assert.equal((await ctx.store.turns.state(sessionId)).contextResetRequested, true)
      assert.equal((await ctx.store.turns.state(sessionId)).attempt?.id, active.attempt.id)
    })
  }
})
