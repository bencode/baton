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

  const createLoop = (deadline = now) =>
    ctx.store.loops.create({
      sessionId,
      message: 'collect',
      intervalSec: 60,
      nextRunAt: now,
      clearAfterSec: 60,
      nextClearAt: deadline,
    })
  const send = (loop: Loop, at = now) =>
    ctx.store.inputs.submit(
      sessionId,
      { text: loop.message, loopId: loop.id },
      { tryClearContextAt: at },
    )
  const claim = async () => {
    const result = await ctx.store.turns.claim(sessionId, {
      claimId: randomUUID(),
      runnerToken: 'runner',
    })
    assert.equal(result.value.kind, 'execute')
    return result.value as ClaimedExecution
  }

  test('deadline boundary resets before enqueue; claim uses the new provider conversation', async () => {
    const loop = await createLoop()
    const early = await send(loop, now - 1)
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    await ctx.store.inputs.cancel(sessionId, early.value.input.id)
    const sent = await send(loop)
    assert.deepEqual(
      sent.events.map(e => e.type),
      ['system', 'queue_changed'],
    )
    assert.deepEqual(sent.events[0]?.payload, { action: 'context_cleared' })
    assert.equal((await ctx.store.loops.get(loop.id))?.nextClearAt, now + 60_000)
    const current = await ctx.store.sessions.get(sessionId)
    assert.notEqual(current?.agentSessionId, 'original')
    assert.equal(current?.cwd, '/tmp/collect')
    assert.equal((await claim()).config.agentSessionId, current?.agentSessionId)
    assert.ok(
      (await ctx.store.sessions.listEvents(sessionId)).some(e => e.id === sent.events[0]?.id),
    )
  })

  test('pending inputs defer clearing without losing manual messages or advancing the clock', async () => {
    const loop = await createLoop()
    const manual = await ctx.store.inputs.submit(sessionId, { text: 'manual instruction' })
    const sent = await send(loop)
    assert.deepEqual(
      sent.events.map(e => e.type),
      ['queue_changed'],
    )
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    assert.equal((await ctx.store.loops.get(loop.id))?.nextClearAt, now)
    assert.deepEqual(
      sent.value.queue.items.map(i => i.id),
      [manual.value.input.id, sent.value.input.id],
    )
  })

  test('running and recovering turns defer clearing; the next idle beat clears', async () => {
    const loop = await createLoop()
    await ctx.store.inputs.submit(sessionId, { text: 'work' })
    const active = await claim()
    const pending = await send(loop)
    assert.deepEqual(
      pending.events.map(e => e.type),
      ['queue_changed'],
    )
    assert.equal((await ctx.store.turns.state(sessionId)).attempt?.status, 'running')
    await ctx.store.inputs.cancel(sessionId, pending.value.input.id)
    await ctx.store.turns.expire(sessionId, active.attempt.leaseUntil + 1)
    await ctx.store.turns.stopped(sessionId, active.attempt.id, 'runner')
    assert.equal((await ctx.store.turns.state(sessionId)).turn?.status, 'recovering')
    const queued = await send(loop)
    assert.equal((await ctx.store.loops.get(loop.id))?.nextClearAt, now)
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    await ctx.store.inputs.cancel(sessionId, queued.value.input.id)
    const recovered = await claim()
    await ctx.store.turns.finish(sessionId, recovered.attempt.id, {
      runnerToken: 'runner',
      outcome: 'completed',
    })
    assert.equal((await send(loop)).events[0]?.type, 'system')
  })

  test('manual clear and another loop leave this loop clock independent', async () => {
    const first = await createLoop()
    const second = await createLoop(now + 1_000)
    await ctx.store.turns.control(sessionId, 'context_clear')
    const manualId = (await ctx.store.sessions.get(sessionId))?.agentSessionId
    assert.equal((await ctx.store.loops.get(first.id))?.nextClearAt, now)
    assert.equal((await ctx.store.loops.get(second.id))?.nextClearAt, now + 1_000)
    await send(first)
    assert.notEqual((await ctx.store.sessions.get(sessionId))?.agentSessionId, manualId)
    assert.equal((await ctx.store.loops.get(second.id))?.nextClearAt, now + 1_000)
  })

  test('failed enqueue rolls back both clear and clock; disabled loops do not clear', async () => {
    const loop = await createLoop()
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
        { tryClearContextAt: now },
      ),
    )
    assert.equal((await ctx.store.sessions.get(sessionId))?.agentSessionId, 'original')
    assert.equal((await ctx.store.loops.get(loop.id))?.nextClearAt, now)
    assert.equal((await ctx.store.inputs.list(sessionId)).items.length, 0)
    assert.equal((await ctx.store.sessions.listEvents(sessionId)).length, 0)
    await ctx.store.loops.update(loop.id, { enabled: false })
    assert.deepEqual(
      (await send(loop)).events.map(e => e.type),
      ['queue_changed'],
    )
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
      const loop = await createLoop()
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
      const sent = await send(loop, now + 60_000)
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
