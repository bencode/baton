import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { type ContractCtx, newCtx, seedReq, seedWorker } from './helpers.ts'

describe('Store contract — sessions', () => {
  let ctx: ContractCtx
  beforeEach(async () => {
    ctx = await newCtx()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('session create: metadata only; materialize fills agentSessionId/worktreePath', async () => {
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const s = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 'dogfood',
      agentKind: 'claude-code',
    })
    assert.equal(typeof s.id, 'number')
    assert.equal(s.workerId, workerId)
    assert.equal(s.agentKind, 'claude-code')
    assert.equal(s.agentSessionId, null)
    assert.equal(s.worktreePath, null)

    const m = await ctx.store.sessions.materialize(s.id, {
      agentSessionId: '11111111-1111-1111-1111-111111111111',
      worktreePath: '/tmp/wt',
    })
    assert.equal(m.agentSessionId, '11111111-1111-1111-1111-111111111111')
    assert.equal(m.worktreePath, '/tmp/wt')
    assert.equal((await ctx.store.sessions.get(s.id))?.worktreePath, '/tmp/wt')
  })

  test('share token: create assigns one; getByShareToken resolves it; bad token → null', async () => {
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const s = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 's',
      agentKind: 'claude-code',
    })
    assert.ok(s.shareToken)
    assert.equal((await ctx.store.sessions.getByShareToken(s.shareToken ?? ''))?.id, s.id)
    assert.equal(await ctx.store.sessions.getByShareToken('garbage'), null)
  })

  test('transcript: appendEvent assigns per-session sequence (0-based); listEvents is ordered', async () => {
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const s = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 's',
      agentKind: 'claude-code',
    })
    const a = await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'hi' })
    const b = await ctx.store.sessions.appendEvent(s.id, 'turn_start', { messageId: a.id })
    assert.equal(a.sequence, 0)
    assert.equal(b.sequence, 1)
    const events = await ctx.store.sessions.listEvents(s.id)
    assert.deepEqual(
      events.map(e => [e.sequence, e.type]),
      [
        [0, 'user_message'],
        [1, 'turn_start'],
      ],
    )
    // payload round-trips through JSON
    assert.deepEqual(events[0]?.payload, { text: 'hi' })
  })

  test('session destroy: row disappears and its transcript cascades away', async () => {
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const s = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 's',
      agentKind: 'claude-code',
    })
    await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'hi' })
    await ctx.store.sessions.destroy(s.id)
    assert.equal(await ctx.store.sessions.get(s.id), null)
    assert.deepEqual(await ctx.store.sessions.listEvents(s.id), [])
  })
})
