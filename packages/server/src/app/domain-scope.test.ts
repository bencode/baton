import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { createApp } from '../app.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson } from './test-helpers.ts'

// Domain isolation: a non-admin user only sees the workspaces they're bound to;
// everything under an unbound workspace is 404 (not 403 — no existence leak).
// Admins and dev (empty user table) bypass scope; worker tokens are exempt.
describe('server HTTP — domain scope (workspace isolation)', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  // Make a login user with a personal API token, so requests can act as them via
  // `Authorization: Bearer <token>` (the cookie gate's bearer branch sets userId).
  const seedUser = async (username: string, isAdmin: boolean) => {
    const u = await ctx.store.users.create({ username, passwordHash: 'x', isAdmin })
    const token = `tok-${username}`
    await ctx.store.users.setApiToken(u.id, token)
    return { id: u.id, token }
  }
  const as = (token: string) => ({ authorization: `Bearer ${token}` })

  // Seed a fully-populated workspace (project + worker + session + requirement +
  // task) directly through the store, so it works regardless of the auth gate.
  const seedWorkspace = async (name: string) => {
    const ws = await ctx.store.workspaces.create({ name })
    const project = await ctx.store.projects.create({ workspaceId: ws.id, name: `${name}-p` })
    const reg = await ctx.store.workers.register({
      projectId: project.id,
      machineId: `mid-${name}`,
      name: `w-${name}`,
      hostname: `h-${name}`,
    })
    if (reg.kind === 'name-collision') throw new Error('unexpected worker name collision')
    const session = await ctx.store.sessions.create({
      projectId: project.id,
      workerId: reg.worker.id,
      mode: 'worker',
      name: `s-${name}`,
      agentKind: 'claude-code',
    })
    const requirement = await ctx.store.requirements.create({
      projectId: project.id,
      title: `r-${name}`,
    })
    const task = await ctx.store.tasks.create({ requirementId: requirement.id, title: `t-${name}` })
    return { ws, project, session, requirement, task, workerToken: reg.apiToken }
  }

  test('non-admin sees only bound workspaces; cross-workspace ids are 404', async () => {
    const app = createApp(ctx.store)
    const a = await seedWorkspace('ws1')
    const b = await seedWorkspace('ws2')
    // Creating users flips auth ON. alice is bound to ws1 only.
    const alice = await seedUser('alice', false)
    await seedUser('root', true)
    await ctx.store.users.bindWorkspace(alice.id, a.ws.id)

    // Workspace list is filtered to the binding.
    const list = (await (
      await app.request('/workspaces', { headers: as(alice.token) })
    ).json()) as {
      id: number
    }[]
    assert.deepEqual(
      list.map(w => w.id),
      [a.ws.id],
    )

    // Own workspace's resources: 200.
    assert.equal(
      (await app.request(`/projects/${a.project.id}`, { headers: as(alice.token) })).status,
      200,
    )
    // Cross-workspace resources (each resolution path): 404.
    for (const path of [
      `/workspaces/${b.ws.id}`,
      `/projects/${b.project.id}`,
      `/sessions/${b.session.id}`,
      `/requirements/${b.requirement.id}`,
      `/tasks/${b.task.id}`,
    ])
      assert.equal((await app.request(path, { headers: as(alice.token) })).status, 404, path)

    // Cross-workspace write: 404. Creating a workspace (non-admin): 403.
    assert.equal(
      (await postJson(app, '/projects', { workspaceId: b.ws.id, name: 'x' }, as(alice.token)))
        .status,
      404,
    )
    assert.equal((await postJson(app, '/workspaces', { name: 'z' }, as(alice.token))).status, 403)
  })

  test('admin bypasses scope; bind/unbind flips visibility', async () => {
    const app = createApp(ctx.store)
    const a = await seedWorkspace('wsA')
    const b = await seedWorkspace('wsB')
    const alice = await seedUser('alice', false)
    const root = await seedUser('root', true)

    // Admin sees both workspaces and any resource.
    const adminList = (await (
      await app.request('/workspaces', { headers: as(root.token) })
    ).json()) as unknown[]
    assert.equal(adminList.length, 2)
    assert.equal(
      (await app.request(`/projects/${b.project.id}`, { headers: as(root.token) })).status,
      200,
    )

    // alice unbound → 404; bind → 200; unbind → 404.
    assert.equal(
      (await app.request(`/projects/${a.project.id}`, { headers: as(alice.token) })).status,
      404,
    )
    await ctx.store.users.bindWorkspace(alice.id, a.ws.id)
    assert.equal(
      (await app.request(`/projects/${a.project.id}`, { headers: as(alice.token) })).status,
      200,
    )
    await ctx.store.users.unbindWorkspace(alice.id, a.ws.id)
    assert.equal(
      (await app.request(`/projects/${a.project.id}`, { headers: as(alice.token) })).status,
      404,
    )
  })

  test('/admin/overview: admin-only fleet snapshot across workspaces', async () => {
    const app = createApp(ctx.store)
    const a = await seedWorkspace('wsX')
    const b = await seedWorkspace('wsY')
    const alice = await seedUser('alice', false)
    const root = await seedUser('root', true)
    await ctx.store.users.bindWorkspace(alice.id, a.ws.id)

    // Non-admin (even bound to a workspace) → 403; admin → the whole fleet.
    assert.equal((await app.request('/admin/overview', { headers: as(alice.token) })).status, 403)
    const r = await app.request('/admin/overview', { headers: as(root.token) })
    assert.equal(r.status, 200)
    const o = (await r.json()) as {
      workspaces: unknown[]
      projects: unknown[]
      workers: { alive: boolean }[]
      sessions: { id: number; attached: boolean; busy: boolean }[]
    }
    assert.equal(o.workspaces.length, 2)
    assert.equal(o.projects.length, 2)
    assert.equal(o.workers.length, 2)
    assert.deepEqual(o.sessions.map(s => s.id).sort(), [a.session.id, b.session.id].sort())
    // Fresh app instance: nothing pinged liveness, nothing attached → all idle.
    assert.ok(o.workers.every(w => w.alive === false))
    assert.ok(o.sessions.every(s => !s.attached && !s.busy))
  })

  test('worker token is exempt from user scope', async () => {
    const app = createApp(ctx.store)
    const a = await seedWorkspace('wsW')
    // Auth ON via an unbound non-admin user — must not lock the worker out.
    await seedUser('alice', false)
    // The daemon reads its own session's transcript via the cookie-gated GET.
    const r = await app.request(`/sessions/${a.session.id}/events`, {
      headers: { authorization: `Bearer ${a.workerToken}` },
    })
    assert.equal(r.status, 200)
  })

  test('empty user table leaves the API open (dev bypass intact)', async () => {
    const app = createApp(ctx.store)
    const a = await seedWorkspace('wsOpen')
    // No users seeded → no auth, no scope.
    assert.equal((await app.request('/workspaces')).status, 200)
    assert.equal((await app.request(`/projects/${a.project.id}`)).status, 200)
  })
})
