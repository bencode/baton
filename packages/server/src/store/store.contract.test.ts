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

  test('session: register issues code S-N + apiToken, getByToken resolves back', async () => {
    const { project } = await seedReq()
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 'ben-laptop',
      capabilities: ['node', 'claude'],
    })
    assert.equal(s.code, 'S-1')
    assert.equal(s.status, 'active')
    assert.equal(typeof s.apiToken, 'string')
    assert.ok(s.apiToken.length >= 20)
    const back = await ctx.store.sessions.getByToken(s.apiToken)
    assert.equal(back?.id, s.id)
    // Domain shape (without token) is what getByToken returns.
    assert.equal((back as unknown as { apiToken?: string }).apiToken, undefined)
  })

  test('claim: caps ⊇ requires + deps met; second claim of same task returns null', async () => {
    const { req, project } = await seedReq()
    const t = await ctx.store.tasks.create({
      requirementId: req,
      title: 'work',
      requires: ['node'],
    })
    const s1 = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's1',
      capabilities: ['node'],
    })
    const claimed = await ctx.store.sessions.claim(s1.id)
    assert.ok(claimed)
    assert.equal(claimed.task.id, t.id)
    assert.equal(claimed.assignment.code, 'A-1')
    assert.equal(claimed.assignment.status, 'running')
    // Task now in_progress, second claim returns null (no eligible work).
    const again = await ctx.store.sessions.claim(s1.id)
    assert.equal(again, null)
  })

  test('claim: skips tasks whose deps are not done', async () => {
    const { req, project } = await seedReq()
    const a = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    await ctx.store.tasks.create({ requirementId: req, title: 'b', dependsOn: [a.id] })
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
      capabilities: [],
    })
    const first = await ctx.store.sessions.claim(s.id)
    assert.equal(first?.task.id, a.id) // a (no deps) picked first
    // a is in_progress now; b still blocked → no more eligible
    const second = await ctx.store.sessions.claim(s.id)
    assert.equal(second, null)
  })

  test('claim: skips tasks whose requires ⊄ session capabilities', async () => {
    const { req, project } = await seedReq()
    await ctx.store.tasks.create({
      requirementId: req,
      title: 'needs-planning',
      requires: ['planning'],
    })
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 'no-planning',
      capabilities: ['node'],
    })
    assert.equal(await ctx.store.sessions.claim(s.id), null)
  })

  test('assignment.complete: done → Task.status=done; failed → Task.status=failed', async () => {
    const { req, project } = await seedReq()
    await ctx.store.tasks.create({ requirementId: req, title: 't1' })
    await ctx.store.tasks.create({ requirementId: req, title: 't2' })
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
      capabilities: [],
    })
    const c1 = await ctx.store.sessions.claim(s.id)
    assert.ok(c1)
    const done = await ctx.store.assignments.complete(c1.assignment.id, 'done', 'ok')
    assert.equal(done.status, 'done')
    assert.equal(done.result, 'ok')
    assert.equal((await ctx.store.tasks.get(c1.task.id))?.status, 'done')

    const c2 = await ctx.store.sessions.claim(s.id)
    assert.ok(c2)
    await ctx.store.assignments.complete(c2.assignment.id, 'failed', 'boom')
    assert.equal((await ctx.store.tasks.get(c2.task.id))?.status, 'failed')
  })

  test('assignment.abandon: releases task back to todo', async () => {
    const { req, project } = await seedReq()
    const t = await ctx.store.tasks.create({ requirementId: req, title: 't' })
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
      capabilities: [],
    })
    const c = await ctx.store.sessions.claim(s.id)
    assert.ok(c)
    await ctx.store.assignments.abandon(c.assignment.id, 'changed mind')
    assert.equal((await ctx.store.tasks.get(t.id))?.status, 'todo')
    // Same session can re-claim.
    const again = await ctx.store.sessions.claim(s.id)
    assert.equal(again?.task.id, t.id)
  })

  test('sweepStale: stale active session → running assignments abandoned, task → todo', async () => {
    const { req, project } = await seedReq()
    const t = await ctx.store.tasks.create({ requirementId: req, title: 't' })
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
      capabilities: [],
    })
    const c = await ctx.store.sessions.claim(s.id)
    assert.ok(c)
    // Sweep with idleThreshold = 0 → every active session is considered stale.
    const released = await ctx.store.sessions.sweepStale(Date.now() + 60_000, 0)
    assert.equal(released, 1)
    const a = await ctx.store.assignments.get(c.assignment.id)
    assert.equal(a?.status, 'abandoned')
    assert.equal((await ctx.store.tasks.get(t.id))?.status, 'todo')
    assert.equal((await ctx.store.sessions.get(s.id))?.status, 'idle')
  })

  test('appendEvent: monotonic sequence, listEvents in order, duplicate sequence rejected', async () => {
    const { req, project } = await seedReq()
    await ctx.store.tasks.create({ requirementId: req, title: 't' })
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
      capabilities: [],
    })
    const c = await ctx.store.sessions.claim(s.id)
    assert.ok(c)
    await ctx.store.assignments.appendEvent(c.assignment.id, 0, { type: 'status', s: 'starting' })
    await ctx.store.assignments.appendEvent(c.assignment.id, 1, { type: 'text', t: 'hi' })
    const events = await ctx.store.assignments.listEvents(c.assignment.id)
    assert.equal(events.length, 2)
    assert.equal(events[0]?.sequence, 0)
    assert.deepEqual(events[1]?.payload, { type: 'text', t: 'hi' })
    await assert.rejects(ctx.store.assignments.appendEvent(c.assignment.id, 0, { dup: true }))
  })
})
