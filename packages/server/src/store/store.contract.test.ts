import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { type Id, isReady, summarizeTaskProgress, type Task } from '@baton/shared'
import { freshStore, type TestStore } from './test-db.ts'

describe('Store contract', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  const seedReq = async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'r' })
    return { req: r.id, project: p.id }
  }

  test('workspace CRUD round-trip', async () => {
    const { workspaces } = ctx.store
    const w = await workspaces.create({ name: 'eng' })
    assert.equal(w.name, 'eng')
    assert.equal(typeof w.id, 'number')
    assert.equal(typeof w.createdAt, 'number')
    assert.deepEqual(await workspaces.get(w.id), w)
    assert.equal((await workspaces.list()).length, 1)
    await workspaces.delete(w.id)
    assert.equal(await workspaces.get(w.id), null)
  })

  test('requirement: code auto-generated R-N + JSON fields round-trip + default status active', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r1 = await ctx.store.requirements.create({
      projectId: p.id,
      title: 'login',
      resources: [{ kind: 'doc', uri: 'docs/login.md', label: 'spec' }],
      tags: ['auth', 'p0'],
    })
    assert.equal(r1.code, 'R-1')
    assert.equal(r1.status, 'active')
    const r2 = await ctx.store.requirements.create({ projectId: p.id, title: 'next' })
    assert.equal(r2.code, 'R-2')
    const got = await ctx.store.requirements.get(r1.id)
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

  test('task: code auto-generated T-N + projectId denorm + dependsOn round-trip', async () => {
    const { req, project } = await seedReq()
    const a = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    const b = await ctx.store.tasks.create({
      requirementId: req,
      title: 'b',
      requires: ['planning'],
      dependsOn: [a.id],
    })
    assert.equal(a.code, 'T-1')
    assert.equal(a.projectId, project)
    assert.equal(a.status, 'todo')
    assert.equal(b.code, 'T-2')
    assert.equal(b.projectId, project)
    const gotB = await ctx.store.tasks.get(b.id)
    assert.deepEqual(gotB?.requires, ['planning'])
    assert.deepEqual(gotB?.dependsOn, [a.id])
  })

  test('counter never recycles: after deleting T-5, next task gets T-6', async () => {
    const { req } = await seedReq()
    const ids: number[] = []
    for (let i = 0; i < 5; i++) {
      const t = await ctx.store.tasks.create({ requirementId: req, title: `t${i + 1}` })
      ids.push(t.id)
      assert.equal(t.code, `T-${i + 1}`)
    }
    const last = ids[4] as number
    await ctx.store.tasks.delete(last)
    const next = await ctx.store.tasks.create({ requirementId: req, title: 'after-delete' })
    assert.equal(next.code, 'T-6')
  })

  test('getByCode resolves a requirement / task within a project', async () => {
    const { req, project } = await seedReq()
    const t = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    const byCode = await ctx.store.tasks.getByCode(project, 'T-1')
    assert.equal(byCode?.id, t.id)
    const r = await ctx.store.requirements.getByCode(project, 'R-1')
    assert.equal(r?.id, req)
    assert.equal(await ctx.store.tasks.getByCode(project, 'T-99'), null)
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
    const byId = new Map<Id, Task>(tasks.map(t => [t.id, t] as const))
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
