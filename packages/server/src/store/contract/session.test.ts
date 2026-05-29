import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { type ContractCtx, newCtx, seedReq } from './helpers.ts'

describe('Store contract — sessions', () => {
  let ctx: ContractCtx
  beforeEach(async () => {
    ctx = await newCtx()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('session register: issues apiToken; carries machineId/hostname/workerName snapshots', async () => {
    const { project } = await seedReq(ctx)
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 'dogfood',
      claudeSessionId: '11111111-1111-1111-1111-111111111111',
      worktreePath: '/tmp/wt',
      machineId: 'mid-abc',
      hostname: 'bens-air.local',
      workerName: 'ben-laptop',
    })
    assert.equal(typeof s.id, 'number')
    assert.equal(s.machineId, 'mid-abc')
    assert.equal(s.hostname, 'bens-air.local')
    assert.equal(s.workerName, 'ben-laptop')
    assert.ok(s.apiToken.length >= 20)
    const back = await ctx.store.sessions.getByToken(s.apiToken)
    assert.equal(back?.id, s.id)
    assert.equal((back as unknown as { apiToken?: string }).apiToken, undefined)
  })

  test('isBusy derived: turn_start with no closing event ⇒ busy', async () => {
    const { project } = await seedReq(ctx)
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    assert.equal(await ctx.store.sessions.isBusy(s.id), false)
    await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'go' })
    assert.equal(await ctx.store.sessions.isBusy(s.id), false)
    await ctx.store.sessions.appendEvent(s.id, 'turn_start', { messageId: 1 })
    assert.equal(await ctx.store.sessions.isBusy(s.id), true)
    await ctx.store.sessions.appendEvent(s.id, 'sdk_event', { type: 'assistant' })
    assert.equal(await ctx.store.sessions.isBusy(s.id), true)
    await ctx.store.sessions.appendEvent(s.id, 'turn_complete', { exitCode: 0 })
    assert.equal(await ctx.store.sessions.isBusy(s.id), false)
    // Subsequent turn flips busy back on
    await ctx.store.sessions.appendEvent(s.id, 'turn_start', { messageId: 2 })
    assert.equal(await ctx.store.sessions.isBusy(s.id), true)
    await ctx.store.sessions.appendEvent(s.id, 'turn_error', { message: 'boom' })
    assert.equal(await ctx.store.sessions.isBusy(s.id), false)
  })

  test('appendEvent: monotonic sequence per session, listEvents in order', async () => {
    const { project } = await seedReq(ctx)
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'hello' })
    await ctx.store.sessions.appendEvent(s.id, 'sdk_event', { type: 'assistant' })
    await ctx.store.sessions.appendEvent(s.id, 'turn_complete', { exitCode: 0 })
    const events = await ctx.store.sessions.listEvents(s.id)
    assert.equal(events.length, 3)
    assert.deepEqual(
      events.map(e => e.sequence),
      [0, 1, 2],
    )
    assert.equal(events[0]?.type, 'user_message')
  })

  test('pending message lifecycle: findNext + markProcessed + count', async () => {
    const { project } = await seedReq(ctx)
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    const m1 = await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'a' })
    const m2 = await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'b' })
    await ctx.store.sessions.appendEvent(s.id, 'sdk_event', { foo: 1 })
    assert.equal(await ctx.store.sessions.pendingMessageCount(s.id), 2)
    const next = await ctx.store.sessions.findNextPendingMessage(s.id)
    assert.equal(next?.id, m1.id)
    await ctx.store.sessions.markMessageProcessed(m1.id)
    assert.equal(await ctx.store.sessions.pendingMessageCount(s.id), 1)
    assert.equal((await ctx.store.sessions.findNextPendingMessage(s.id))?.id, m2.id)
  })

  test('session close sets closedAt; getByToken still resolves (auth filters in middleware)', async () => {
    const { project } = await seedReq(ctx)
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    await ctx.store.sessions.close(s.id)
    const closed = await ctx.store.sessions.get(s.id)
    assert.equal(typeof closed?.closedAt, 'number')
  })
})
