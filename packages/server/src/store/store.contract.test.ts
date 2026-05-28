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

  test('requirement.update advances product-dimension status', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'x' })
    const updated = await ctx.store.requirements.update(r.id, { status: 'done' })
    assert.equal(updated.status, 'done')
  })

  test('task: code T-N + projectId denorm + dependsOn round-trip', async () => {
    const { req, project } = await seedReq()
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

  test('counter never recycles after delete', async () => {
    const { req } = await seedReq()
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

  test('getByCode resolves R/T/S within a project', async () => {
    const { req, project } = await seedReq()
    const t = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    assert.equal((await ctx.store.tasks.getByCode(project, 'T-1'))?.id, t.id)
    assert.equal((await ctx.store.requirements.getByCode(project, 'R-1'))?.id, req)
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 'w1',
    })
    assert.equal((await ctx.store.sessions.getByCode(project, 'S-1'))?.id, s.id)
    assert.equal(await ctx.store.tasks.getByCode(project, 'T-99'), null)
  })

  test('summarize + isReady over persisted data', async () => {
    const { req } = await seedReq()
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

  test('cascade delete clears the whole chain', async () => {
    const w = await ctx.store.workspaces.create({ name: 'w' })
    const p = await ctx.store.projects.create({ workspaceId: w.id, name: 'p' })
    const r = await ctx.store.requirements.create({ projectId: p.id, title: 'r' })
    const t = await ctx.store.tasks.create({ requirementId: r.id, title: 't' })
    await ctx.store.workspaces.delete(w.id)
    assert.equal(await ctx.store.projects.get(p.id), null)
    assert.equal(await ctx.store.requirements.get(r.id), null)
    assert.equal(await ctx.store.tasks.get(t.id), null)
  })

  // === M2.5: session as chat channel ===

  test('session register: issues S-N + apiToken; getByToken resolves back; token not in domain shape', async () => {
    const { project } = await seedReq()
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 'ben-laptop',
      claudeSessionId: '11111111-1111-1111-1111-111111111111',
      worktreePath: '/tmp/wt',
    })
    assert.equal(s.code, 'S-1')
    assert.equal(s.state, 'idle')
    assert.equal(s.claudeSessionId, '11111111-1111-1111-1111-111111111111')
    assert.equal(s.worktreePath, '/tmp/wt')
    assert.ok(s.apiToken.length >= 20)
    const back = await ctx.store.sessions.getByToken(s.apiToken)
    assert.equal(back?.id, s.id)
    assert.equal((back as unknown as { apiToken?: string }).apiToken, undefined)
  })

  test('appendEvent: monotonic sequence per session, listEvents in order', async () => {
    const { project } = await seedReq()
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
    assert.deepEqual(events[0]?.payload, { text: 'hello' })
  })

  test('pending message lifecycle: findNextPendingMessage + markMessageProcessed + count', async () => {
    const { project } = await seedReq()
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    const m1 = await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'a' })
    const m2 = await ctx.store.sessions.appendEvent(s.id, 'user_message', { text: 'b' })
    // sdk_event in between is not a 'pending message'
    await ctx.store.sessions.appendEvent(s.id, 'sdk_event', { foo: 1 })
    assert.equal(await ctx.store.sessions.pendingMessageCount(s.id), 2)
    const next = await ctx.store.sessions.findNextPendingMessage(s.id)
    assert.equal(next?.id, m1.id) // FIFO by sequence
    await ctx.store.sessions.markMessageProcessed(m1.id)
    assert.equal(await ctx.store.sessions.pendingMessageCount(s.id), 1)
    assert.equal((await ctx.store.sessions.findNextPendingMessage(s.id))?.id, m2.id)
  })

  test('setState transitions + resetBusySessions recovers crashed boots', async () => {
    const { project } = await seedReq()
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    assert.equal((await ctx.store.sessions.get(s.id))?.state, 'idle')
    await ctx.store.sessions.setState(s.id, 'busy')
    assert.equal((await ctx.store.sessions.get(s.id))?.state, 'busy')
    const recovered = await ctx.store.sessions.resetBusySessions()
    assert.equal(recovered, 1)
    assert.equal((await ctx.store.sessions.get(s.id))?.state, 'idle')
  })

  test('close → state=closed + closedAt set', async () => {
    const { project } = await seedReq()
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    await ctx.store.sessions.close(s.id)
    const closed = await ctx.store.sessions.get(s.id)
    assert.equal(closed?.state, 'closed')
    assert.equal(typeof closed?.closedAt, 'number')
  })
})
