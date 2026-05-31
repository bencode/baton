import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { type ContractCtx, newCtx, seedReq, seedWorker } from './helpers.ts'

describe('Store contract — task comments', () => {
  let ctx: ContractCtx
  beforeEach(async () => {
    ctx = await newCtx()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('append-only: created one at a time, listed in insertion order', async () => {
    const { req, project } = await seedReq(ctx)
    const task = await ctx.store.tasks.create({ requirementId: req, title: 't' })
    const worker = await seedWorker(ctx, project)

    const first = await ctx.store.taskComments.create({ taskId: task.id, body: 'human note' })
    const second = await ctx.store.taskComments.create({
      taskId: task.id,
      body: 'agent hand-off',
      workerId: worker,
    })

    const list = await ctx.store.taskComments.listByTask(task.id)
    assert.deepEqual(
      list.map(c => c.id),
      [first.id, second.id],
    )
    // workerId attribution: undefined = human, set = the worker/agent.
    assert.equal(list[0]?.workerId, undefined)
    assert.equal(list[1]?.workerId, worker)
    assert.equal(list[1]?.body, 'agent hand-off')
  })

  test('comments cascade away with their task', async () => {
    const { req } = await seedReq(ctx)
    const task = await ctx.store.tasks.create({ requirementId: req, title: 't' })
    await ctx.store.taskComments.create({ taskId: task.id, body: 'note' })

    await ctx.store.tasks.delete(task.id)

    assert.deepEqual(await ctx.store.taskComments.listByTask(task.id), [])
  })
})
