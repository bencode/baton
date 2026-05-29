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

  test('getByCode resolves R / T within a project (sessions no longer carry codes)', async () => {
    const { req, project } = await seedReq()
    const t = await ctx.store.tasks.create({ requirementId: req, title: 'a' })
    assert.equal((await ctx.store.tasks.getByCode(project, 'T-1'))?.id, t.id)
    assert.equal((await ctx.store.requirements.getByCode(project, 'R-1'))?.id, req)
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

  // === M2.6: sessions (no code/state/heartbeatAt) + workers + isBusy derive ===

  test('session register: issues apiToken; carries machineId/hostname/workerName snapshots', async () => {
    const { project } = await seedReq()
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
    const { project } = await seedReq()
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
  })

  test('pending message lifecycle: findNext + markProcessed + count', async () => {
    const { project } = await seedReq()
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
    const { project } = await seedReq()
    const s = await ctx.store.sessions.register({
      projectId: project,
      mode: 'worker',
      name: 's',
    })
    await ctx.store.sessions.close(s.id)
    const closed = await ctx.store.sessions.get(s.id)
    assert.equal(typeof closed?.closedAt, 'number')
  })

  // --- workers --------------------------------------------------------------

  test('worker register: rule 2a creates a fresh worker', async () => {
    const { project } = await seedReq()
    const out = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben-laptop',
      hostname: 'bens-air.local',
    })
    assert.equal(out.kind, 'created')
    if (out.kind !== 'created') throw new Error('unreachable')
    assert.equal(out.worker.machineId, 'mid-1')
    assert.equal(out.worker.name, 'ben-laptop')
  })

  test('worker register: rule 1 reattaches by machineId; can update name on the fly', async () => {
    const { project } = await seedReq()
    await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben-laptop',
      hostname: 'bens-air.local',
    })
    const again = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben-laptop-renamed',
      hostname: 'bens-air.local',
    })
    assert.equal(again.kind, 'reattached-machine')
    if (again.kind !== 'reattached-machine') throw new Error('unreachable')
    assert.equal(again.worker.name, 'ben-laptop-renamed')
    // Only one worker row exists alive in this project
    const list = await ctx.store.workers.listByProject(project)
    assert.equal(list.filter(w => w.closedAt === undefined).length, 1)
  })

  test('worker register: rule 2c rejects name collision from a different machine', async () => {
    const { project } = await seedReq()
    await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'shared-name',
      hostname: 'host-a',
    })
    const collide = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-2',
      name: 'shared-name',
      hostname: 'host-b',
    })
    assert.equal(collide.kind, 'name-collision')
  })

  test('worker close: same machineId can register again afterward (new row)', async () => {
    const { project } = await seedReq()
    const a = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben',
      hostname: 'h',
    })
    if (a.kind !== 'created') throw new Error('unreachable')
    await ctx.store.workers.close(a.worker.id)
    const b = await ctx.store.workers.register({
      projectId: project,
      machineId: 'mid-1',
      name: 'ben',
      hostname: 'h',
    })
    assert.equal(b.kind, 'created')
    if (b.kind !== 'created') throw new Error('unreachable')
    assert.notEqual(a.worker.id, b.worker.id)
    // findAlive resolves the live one
    const alive = await ctx.store.workers.findAlive(project, 'mid-1')
    assert.equal(alive?.id, b.worker.id)
  })
})
