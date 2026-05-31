import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { type Id, isReady, summarizeTaskProgress, type Task } from '@baton/shared'
import { type ContractCtx, newCtx, seedReq } from './helpers.ts'

describe('Store contract — tasks', () => {
  let ctx: ContractCtx
  beforeEach(async () => {
    ctx = await newCtx()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('task: code T-N + projectId denorm + dependsOn round-trip', async () => {
    const { req, project } = await seedReq(ctx)
    const a = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    const b = await ctx.store.tasks.create({
      requirementId: req,
      title: 'b',
      dependsOn: [a.id],
    })
    assert.equal(a.code, 'T-1')
    assert.equal(a.projectId, project)
    assert.equal(b.code, 'T-2')
    assert.equal(b.projectId, project)
    const gotB = await ctx.store.tasks.get(b.id)
    assert.deepEqual(gotB?.dependsOn, [a.id])
  })

  test('task: markdown body round-trips on create and update', async () => {
    const { req } = await seedReq(ctx)
    const t = await ctx.store.tasks.create({
      requirementId: req,
      title: 'a',
      body: '## detail\n- one',
    })
    assert.equal((await ctx.store.tasks.get(t.id))?.body, '## detail\n- one')
    const updated = await ctx.store.tasks.update(t.id, { body: '# changed' })
    assert.equal(updated.body, '# changed')
  })

  test('counter never recycles after delete', async () => {
    const { req } = await seedReq(ctx)
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      const t = await ctx.store.tasks.create({ requirementId: req, title: `t${i + 1}` })
      ids.push(t.id)
      assert.equal(t.code, `T-${i + 1}`)
    }
    await ctx.store.tasks.delete(ids[4] as number)
    const next = await ctx.store.tasks.create({ requirementId: req, title: 'after-delete' })
    assert.equal(next.code, 'T-6')
  })

  test('getByCode resolves R / T within a project (sessions no longer carry codes)', async () => {
    const { req, project } = await seedReq(ctx)
    const t = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    assert.equal((await ctx.store.tasks.getByCode(project, 'T-1'))?.id, t.id)
    assert.equal((await ctx.store.requirements.getByCode(project, 'R-1'))?.id, req)
    assert.equal(await ctx.store.tasks.getByCode(project, 'T-99'), null)
  })

  test('summarize + isReady over persisted data', async () => {
    const { req } = await seedReq(ctx)
    const a = await ctx.store.tasks.create({ requirementId: req, title: 'a', status: 'done' })
    const b = await ctx.store.tasks.create({ requirementId: req, title: 'b', dependsOn: [a.id] })
    await ctx.store.tasks.create({ requirementId: req, title: 'c', status: 'in_progress' })
    const agg = await ctx.store.getRequirementWithTasks(req)
    assert.equal(agg?.tasks.length, 3)
    assert.deepEqual(summarizeTaskProgress(agg?.tasks ?? []), {
      total: 3,
      done: 1,
      inProgress: 1,
      failed: 0,
    })
    const byId = new Map<Id, Task>(agg?.tasks.map(t => [t.id, t] as const) ?? [])
    const storedB = byId.get(b.id)
    assert.ok(storedB)
    assert.equal(isReady(storedB, byId), true)
  })
})
