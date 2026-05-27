import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { isReady, summarizeTaskProgress, type Task } from '@baton/shared'
import { freshStore, type TestStore } from './test-db.ts'

describe('Store contract', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  const seedReq = async (): Promise<{ req: string }> => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'r' })
    return { req: r.id }
  }

  test('workspace CRUD round-trip', async () => {
    const { workspaces } = ctx.store
    const w = await workspaces.create({ name: 'eng' })
    assert.equal(w.name, 'eng')
    assert.equal(typeof w.createdAt, 'number')
    assert.deepEqual(await workspaces.get(w.id), w)
    assert.equal((await workspaces.list()).length, 1)
    await workspaces.delete(w.id)
    assert.equal(await workspaces.get(w.id), null)
  })

  test('requirement: JSON fields round-trip + default status active', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({
      projectId: p.id,
      title: 'login',
      resources: [{ kind: 'doc', uri: 'docs/login.md', label: 'spec' }],
      tags: ['auth', 'p0'],
    })
    assert.equal(r.status, 'active')
    const got = await ctx.store.requirements.get(r.id)
    assert.deepEqual(got?.resources, [{ kind: 'doc', uri: 'docs/login.md', label: 'spec' }])
    assert.deepEqual(got?.tags, ['auth', 'p0'])
  })

  test('requirement.update advances product-dimension status (independent of tasks)', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'x' })
    const updated = await ctx.store.requirements.update(r.id, { status: 'done' })
    assert.equal(updated.status, 'done')
  })

  test('task: requires/dependsOn round-trip + default status todo', async () => {
    const { req } = await seedReq()
    const a = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    const b = await ctx.store.tasks.create({
      requirementId: req,
      title: 'b',
      requires: ['planning'],
      dependsOn: [a.id],
    })
    assert.equal(a.status, 'todo')
    const gotB = await ctx.store.tasks.get(b.id)
    assert.deepEqual(gotB?.requires, ['planning'])
    assert.deepEqual(gotB?.dependsOn, [a.id])
  })

  test('getRequirementWithTasks + summarizeTaskProgress over persisted data', async () => {
    const { req } = await seedReq()
    await ctx.store.tasks.create({ requirementId: req, title: 'a', status: 'done' })
    await ctx.store.tasks.create({ requirementId: req, title: 'b', status: 'in_progress' })
    const agg = await ctx.store.getRequirementWithTasks(req)
    assert.equal(agg?.tasks.length, 2)
    assert.deepEqual(summarizeTaskProgress(agg?.tasks ?? []), {
      total: 2,
      done: 1,
      inProgress: 1,
      failed: 0,
    })
  })

  test('isReady: DAG dependencies derived over persisted data', async () => {
    const { req } = await seedReq()
    const a = await ctx.store.tasks.create({ requirementId: req, title: 'a', status: 'done' })
    const b = await ctx.store.tasks.create({ requirementId: req, title: 'b', dependsOn: [a.id] })
    const { tasks } = (await ctx.store.getRequirementWithTasks(req)) ?? { tasks: [] }
    const byId = new Map<string, Task>(tasks.map(t => [t.id, t] as const))
    const storedB = byId.get(b.id)
    assert.ok(storedB)
    assert.equal(isReady(storedB, byId), true)
  })

  test('cascade delete: deleting a Workspace clears the whole chain', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'r' })
    const t = await ctx.store.tasks.create({ requirementId: r.id, title: 't' })
    await ctx.store.workspaces.delete(w.id)
    assert.equal(await ctx.store.projects.get(p.id), null)
    assert.equal(await ctx.store.requirements.get(r.id), null)
    assert.equal(await ctx.store.tasks.get(t.id), null)
  })
})
