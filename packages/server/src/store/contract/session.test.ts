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

  test('session register: requires workerId FK + carries agentKind/agentSessionId', async () => {
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const s = await ctx.store.sessions.register({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 'dogfood',
      agentKind: 'claude-code',
      agentSessionId: '11111111-1111-1111-1111-111111111111',
      worktreePath: '/tmp/wt',
    })
    assert.equal(typeof s.id, 'number')
    assert.equal(s.workerId, workerId)
    assert.equal(s.agentKind, 'claude-code')
    assert.equal(s.agentSessionId, '11111111-1111-1111-1111-111111111111')
    assert.equal(s.worktreePath, '/tmp/wt')
    assert.ok(s.apiToken.length >= 20)
    const back = await ctx.store.sessions.getByToken(s.apiToken)
    assert.equal(back?.id, s.id)
    assert.equal((back as unknown as { apiToken?: string }).apiToken, undefined)
  })

  test('session destroy: row disappears (events live in browser-local storage,', async () => {
    // not in the contract anymore)
    const { project } = await seedReq(ctx)
    const workerId = await seedWorker(ctx, project)
    const s = await ctx.store.sessions.register({
      projectId: project,
      workerId,
      mode: 'worker',
      name: 's',
      agentKind: 'claude-code',
      agentSessionId: 'a-4',
      worktreePath: '/tmp/wt',
    })
    await ctx.store.sessions.destroy(s.id)
    assert.equal(await ctx.store.sessions.get(s.id), null)
  })
})
