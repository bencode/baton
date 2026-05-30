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

  test('session destroy: row disappears (events live in browser-local storage,', async () => {
    // not in the contract anymore)
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const s = await ctx.store.sessions.create({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 's',
      agentKind: 'claude-code',
    })
    await ctx.store.sessions.destroy(s.id)
    assert.equal(await ctx.store.sessions.get(s.id), null)
  })
})
