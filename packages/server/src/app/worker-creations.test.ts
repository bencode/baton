import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type {
  CreationWorkerResult,
  ProvisionerSignal,
  WorkerCreation,
  WorkerTemplate,
} from '@baton/shared'
import { createApp } from '../app.ts'
import { createCommandBus } from '../command-bus.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { createProvisionerBus } from '../worker-provisioning/bus.ts'
import { postJson, readUntil } from './test-helpers.ts'

describe('worker template creation protocol', () => {
  let ctx: TestStore
  let app: ReturnType<typeof createApp>
  let projectId: number
  let bus: ReturnType<typeof createProvisionerBus>
  let commands: ReturnType<typeof createCommandBus>
  let signals: ProvisionerSignal[]
  let cleanup: (() => void)[]
  const daemon = { authorization: 'Bearer mini-secret' }

  beforeEach(async () => {
    ctx = await freshStore()
    const ws = await ctx.store.workspaces.create({ name: 'personal' })
    const project = await ctx.store.projects.create({ workspaceId: ws.id, name: 'project' })
    projectId = project.id
    bus = createProvisionerBus()
    commands = createCommandBus()
    signals = []
    cleanup = []
    app = createApp(ctx.store, { provisionerBus: bus, provisionerToken: 'mini-secret', commands })
  })
  afterEach(async () => {
    cleanup.forEach(stop => {
      stop()
    })
    await ctx.cleanup()
  })
  const online = () => {
    cleanup.push(bus.subscribe('mini', signal => signals.push(signal)))
  }
  const create = async (name = 'new-worker') => {
    const response = await postJson(app, `/projects/${projectId}/worker-creations`, {
      templateId: 'mini-local',
      name,
      agentKind: 'codex',
    })
    assert.equal(response.status, 202)
    return (await response.json()) as WorkerCreation
  }
  const progress = (id: number, body: unknown) =>
    postJson(app, `/provisioner/worker-creations/${id}/progress`, body, daemon)
  const registering = async (creation: WorkerCreation) => {
    for (const step of ['directory', 'git', 'register'])
      assert.equal(
        (await progress(creation.id, { status: 'running', step, repoPath: '/mini/project' }))
          .status,
        200,
      )
  }
  const register = async (id: number) => {
    const response = await postJson(
      app,
      `/provisioner/worker-creations/${id}/worker`,
      { hostname: 'mini' },
      daemon,
    )
    assert.equal(response.status, 200)
    return (await response.json()) as CreationWorkerResult
  }

  test('offline and unconfigured templates reject requests without creating records', async () => {
    const path = `/projects/${projectId}/worker-creations`
    const input = { templateId: 'mini-local', name: 'worker', agentKind: 'codex' }
    assert.equal((await postJson(app, path, input)).status, 503)
    const disabled = createApp(ctx.store, { provisionerToken: '', provisionerBus: bus })
    online()
    assert.equal((await postJson(disabled, path, input)).status, 503)
    assert.equal((await disabled.request('/provisioner/stream', { headers: daemon })).status, 503)
    assert.deepEqual(await ctx.store.workerCreations.listByProject(projectId), [])
    const templates = (await (
      await app.request(`/projects/${projectId}/worker-templates`)
    ).json()) as WorkerTemplate[]
    assert.equal(templates[0]?.available, true)
  })

  test('submission reserves a name, persists a request and does not create a worker', async () => {
    online()
    const first = await create(' worker ')
    assert.equal(first.name, 'worker')
    assert.equal(first.status, 'pending')
    assert.equal(first.step, null)
    assert.equal(first.workerId, null)
    assert.deepEqual(await ctx.store.workers.listByProject(projectId), [])
    assert.deepEqual(signals, [{ action: 'create', creationId: first.id }])
    const duplicate = await postJson(app, `/projects/${projectId}/worker-creations`, {
      templateId: 'mini-local',
      name: 'worker',
      agentKind: 'codex',
    })
    assert.equal(duplicate.status, 409)
    const second = await create('another')
    assert.notEqual(first.machineId, second.machineId)
    assert.equal((await progress(first.id, { status: 'running', step: 'register' })).status, 409)
    assert.equal((await progress(first.id, { status: 'succeeded' })).status, 409)
  })

  test('registration recovers its stable identity and success requires a connected matching worker', async () => {
    online()
    const creation = await create()
    await registering(creation)
    // A server interruption between registration and association is recoverable.
    const initial = await ctx.store.workers.register({
      projectId,
      name: creation.name,
      agentKind: creation.agentKind,
      machineId: creation.machineId,
      hostname: 'mini',
    })
    assert.notEqual(initial.kind, 'name-collision')
    const first = await register(creation.id)
    const second = await register(creation.id)
    assert.equal(first.worker.id, second.worker.id)
    assert.equal(first.apiToken, second.apiToken)
    assert.equal((await ctx.store.workers.listByProject(projectId)).length, 1)
    for (const step of ['start', 'connect'])
      assert.equal((await progress(creation.id, { status: 'running', step })).status, 200)
    assert.equal((await progress(creation.id, { status: 'succeeded' })).status, 409)
    const disconnect = commands.subscribe(first.worker.id, () => {})
    const result = (await (
      await progress(creation.id, { status: 'succeeded' })
    ).json()) as WorkerCreation
    disconnect()
    assert.equal(result.status, 'succeeded')
    const repeated = (await (
      await progress(creation.id, { status: 'succeeded' })
    ).json()) as WorkerCreation
    assert.deepEqual(repeated, result)
    assert.equal(
      (await progress(creation.id, { status: 'failed', error: 'late error' })).status,
      409,
    )
    const otherApp = createApp(ctx.store, { provisionerToken: 'mini-secret' })
    const restored = await (await otherApp.request(`/worker-creations/${creation.id}`)).json()
    assert.deepEqual(restored, result)
    assert.equal('apiToken' in restored, false)
  })

  test('failure retains resources and terminal records cannot recreate a deleted worker', async () => {
    online()
    const creation = await create()
    await registering(creation)
    const registered = await register(creation.id)
    const failed = (await (
      await progress(creation.id, { status: 'failed', error: 'launchd failed' })
    ).json()) as WorkerCreation
    assert.equal(failed.step, 'register')
    assert.equal(failed.repoPath, '/mini/project')
    assert.equal(failed.workerId, registered.worker.id)
    assert.equal((await ctx.store.projects.get(projectId))?.id, projectId)
    assert.deepEqual(await ctx.store.workerCreations.worklist(), [])
    assert.equal(
      (await progress(creation.id, { status: 'failed', error: 'different error' })).status,
      409,
    )
    await ctx.store.workers.destroy(registered.worker.id)
    const denied = await postJson(
      app,
      `/provisioner/worker-creations/${creation.id}/worker`,
      { hostname: 'mini' },
      daemon,
    )
    assert.equal(denied.status, 409)
    assert.equal((await ctx.store.workerCreations.get(creation.id))?.workerId, null)
  })

  test('user, worker and provisioner credentials have separate scopes', async () => {
    online()
    const creation = await create()
    const otherWs = await ctx.store.workspaces.create({ name: 'other' })
    const other = await ctx.store.projects.create({ workspaceId: otherWs.id, name: 'other' })
    const user = await ctx.store.users.create({ username: 'member', passwordHash: 'unused' })
    await ctx.store.users.setApiToken(user.id, 'user-token')
    const ownProject = await ctx.store.projects.get(projectId)
    assert.ok(ownProject)
    await ctx.store.users.bindWorkspace(user.id, ownProject.workspaceId)
    const userAuth = { authorization: 'Bearer user-token' }
    assert.equal(
      (await app.request(`/worker-creations/${creation.id}`, { headers: userAuth })).status,
      200,
    )
    assert.equal(
      (await app.request(`/projects/${other.id}/worker-templates`, { headers: userAuth })).status,
      404,
    )
    const worker = await ctx.store.workers.register({
      projectId,
      name: 'existing',
      machineId: 'existing',
      hostname: 'mini',
    })
    assert.ok(worker.kind !== 'name-collision')
    const workerAuth = { authorization: `Bearer ${worker.apiToken}` }
    assert.equal(
      (await app.request(`/projects/${projectId}/worker-templates`, { headers: workerAuth }))
        .status,
      200,
    )
    assert.equal(
      (await app.request(`/projects/${other.id}/worker-templates`, { headers: workerAuth })).status,
      404,
    )
    assert.equal(
      (await app.request('/provisioner/worker-creations', { headers: userAuth })).status,
      401,
    )
    assert.equal(
      (await app.request('/provisioner/worker-creations', { headers: workerAuth })).status,
      401,
    )
    assert.equal(
      (await app.request(`/worker-creations/${creation.id}`, { headers: daemon })).status,
      401,
    )
    assert.equal(
      (await progress(creation.id, { status: 'running', step: 'directory' })).status,
      200,
    )
  })

  test('failed replay closes the stream and reconnect recovers unchanged requests', async t => {
    const stop = bus.subscribe('mini', () => {})
    const pending = await create('pending')
    const running = await create('running')
    assert.equal((await progress(running.id, { status: 'running', step: 'directory' })).status, 200)
    const before = await ctx.store.workerCreations.listByProject(projectId)
    stop()
    const worklist = ctx.store.workerCreations.worklist
    let failNext = true
    t.mock.method(ctx.store.workerCreations, 'worklist', async () => {
      if (failNext) {
        failNext = false
        throw new Error('temporary replay read failure')
      }
      return worklist()
    })
    const abort = new AbortController()
    cleanup.push(() => abort.abort())
    const failed = await app.request('/provisioner/stream', {
      headers: daemon,
      signal: abort.signal,
    })
    assert.ok(failed.body)
    const reader = failed.body.getReader()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const end = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('failed replay did not close the stream')),
            1000,
          )
        }),
      ])
      assert.equal(end.done, true)
      assert.equal(bus.has('mini'), false)
    } finally {
      clearTimeout(timeout)
      abort.abort()
      await reader.cancel()
    }
    const templates = (await (
      await app.request(`/projects/${projectId}/worker-templates`)
    ).json()) as WorkerTemplate[]
    assert.equal(templates[0]?.available, false)
    assert.deepEqual(await ctx.store.workerCreations.listByProject(projectId), before)

    const reconnect = new AbortController()
    cleanup.push(() => reconnect.abort())
    const recovered = await app.request('/provisioner/stream', {
      headers: daemon,
      signal: reconnect.signal,
    })
    assert.equal(recovered.status, 200)
    assert.ok(recovered.body)
    const recoveredReader = recovered.body.getReader()
    try {
      const frames = await readUntil(recoveredReader, 2, 1000)
      assert.deepEqual(
        frames
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => JSON.parse(line.slice(5)) as ProvisionerSignal),
        [
          { action: 'create', creationId: pending.id },
          { action: 'inspect', creationId: running.id },
        ],
      )
      assert.deepEqual(await ctx.store.workerCreations.listByProject(projectId), before)
      assert.equal(
        (await progress(pending.id, { status: 'failed', error: 'manually resolved' })).status,
        200,
      )
      const next = await create('pending')
      assert.notEqual(next.id, pending.id)
    } finally {
      reconnect.abort()
      await recoveredReader.cancel()
    }
  })

  test('SSE reconnect distinguishes creation from inspection and only admits one mini stream', async () => {
    const stop = bus.subscribe('mini', () => {})
    const pending = await create('pending')
    const running = await create('running')
    assert.equal((await progress(running.id, { status: 'running', step: 'directory' })).status, 200)
    stop()
    const abort = new AbortController()
    cleanup.push(() => abort.abort())
    const response = await app.request('/provisioner/stream', {
      headers: daemon,
      signal: abort.signal,
    })
    assert.equal(response.status, 200)
    assert.ok(response.body)
    const reader = response.body.getReader()
    const frames = await readUntil(reader, 2, 1000)
    const messages = frames
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => JSON.parse(line.slice(5)) as ProvisionerSignal)
    assert.deepEqual(messages, [
      { action: 'create', creationId: pending.id },
      { action: 'inspect', creationId: running.id },
    ])
    assert.equal((await app.request('/provisioner/stream', { headers: daemon })).status, 409)
    abort.abort()
    await reader.cancel()
    assert.equal(bus.has('mini'), false)
    assert.equal((await ctx.store.workerCreations.get(running.id))?.status, 'running')
  })
})
