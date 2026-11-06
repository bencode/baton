import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type {
  AdminHost,
  CreationWorkerResult,
  HostCredential,
  HostOption,
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
  let workspaceId: number
  let hostId: number
  let daemon: { authorization: string }
  let bus: ReturnType<typeof createProvisionerBus>
  let commands: ReturnType<typeof createCommandBus>
  let signals: ProvisionerSignal[]
  let cleanup: (() => void)[]

  beforeEach(async () => {
    ctx = await freshStore()
    const ws = await ctx.store.workspaces.create({ name: 'personal' })
    const project = await ctx.store.projects.create({ workspaceId: ws.id, name: 'project' })
    projectId = project.id
    workspaceId = ws.id
    const { host, token } = await ctx.store.hosts.create({ name: 'mac-1' })
    await ctx.store.hosts.assign(host.id, ws.id)
    hostId = host.id
    daemon = { authorization: `Bearer ${token}` }
    bus = createProvisionerBus()
    commands = createCommandBus()
    signals = []
    cleanup = []
    app = createApp(ctx.store, { provisionerBus: bus, commands })
  })
  afterEach(async () => {
    cleanup.forEach(stop => {
      stop()
    })
    await ctx.cleanup()
  })
  const online = () => {
    cleanup.push(bus.subscribe(hostId, signal => signals.push(signal)))
  }
  const create = async (name = 'new-worker') => {
    const response = await postJson(app, `/projects/${projectId}/worker-creations`, {
      templateId: 'mini-local',
      name,
      agentKind: 'codex',
      hostId,
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

  const finish = async (creation: WorkerCreation) => {
    await registering(creation)
    const { worker } = await register(creation.id)
    for (const step of ['start', 'connect'])
      assert.equal((await progress(creation.id, { status: 'running', step })).status, 200)
    const disconnect = commands.subscribe(worker.id, () => {})
    assert.equal((await progress(creation.id, { status: 'succeeded' })).status, 200)
    disconnect()
    return worker
  }
  const share = (project: number, name: string, repoPath: string, host?: number) =>
    postJson(app, `/projects/${project}/worker-creations`, {
      templateId: 'mini-local',
      name,
      agentKind: 'codex',
      repoPath,
      ...(host === undefined ? {} : { hostId: host }),
    })
  const request = (name: string, host?: number) =>
    postJson(app, `/projects/${projectId}/worker-creations`, {
      templateId: 'mini-local',
      name,
      agentKind: 'codex',
      ...(host === undefined ? {} : { hostId: host }),
    })
  const secondHost = async () => {
    const { host, token } = await ctx.store.hosts.create({ name: 'mac-2' })
    await ctx.store.hosts.assign(host.id, workspaceId)
    return { id: host.id, auth: { authorization: `Bearer ${token}` } }
  }

  test('a new worker can share only a directory where a worker of this project lives', async () => {
    online()
    const owner = await create('owner')
    assert.equal((await share(projectId, 'too-early', '/mini/project')).status, 400)
    const worker = await finish(owner)

    const accepted = await share(projectId, 'guest', '/mini/project')
    assert.equal(accepted.status, 202)
    assert.equal(((await accepted.json()) as WorkerCreation).repoPath, '/mini/project')
    assert.equal((await share(projectId, 'lost', '/mini/elsewhere')).status, 400)
    const ws = await ctx.store.workspaces.create({ name: 'other' })
    const other = await ctx.store.projects.create({ workspaceId: ws.id, name: 'other' })
    await ctx.store.hosts.assign(hostId, ws.id)
    assert.equal((await share(other.id, 'intruder', '/mini/project')).status, 400)
    assert.equal(
      (
        await postJson(app, `/projects/${projectId}/worker-creations`, {
          templateId: 'mini-local',
          name: 'blank',
          agentKind: 'codex',
          repoPath: ' ',
        })
      ).status,
      400,
    )
    assert.deepEqual(
      (await ctx.store.workerCreations.listByProject(projectId)).map(item => item.name),
      ['guest', 'owner'],
    )

    await ctx.store.workers.destroy(worker.id)
    assert.equal((await share(projectId, 'orphan', '/mini/project')).status, 400)
  })

  test('the project worker list says which directory each worker runs in', async () => {
    online()
    const provisioned = await finish(await create('provisioned'))
    const manual = await ctx.store.workers.register({
      projectId,
      name: 'manual',
      agentKind: 'codex',
      machineId: 'manual-machine',
      hostname: 'laptop',
    })
    assert.notEqual(manual.kind, 'name-collision')
    const list = (await (await app.request(`/projects/${projectId}/workers`)).json()) as {
      id: number
      name: string
      directory: string | null
      hostId: number | null
    }[]
    assert.deepEqual(list.map(({ name, directory, hostId }) => [name, directory, hostId]).sort(), [
      ['manual', null, null],
      ['provisioned', '/mini/project', hostId],
    ])
    assert.ok(list.some(worker => worker.id === provisioned.id))
  })

  test('a request resolves to one online host of the workspace or creates nothing', async () => {
    const templates = async () =>
      (await (
        await app.request(`/projects/${projectId}/worker-templates`)
      ).json()) as WorkerTemplate[]
    assert.equal((await request('offline')).status, 503)
    assert.equal((await templates())[0]?.available, false)
    online()
    assert.equal((await templates())[0]?.available, true)

    const alone = await request('alone')
    assert.equal(alone.status, 202)
    assert.equal(((await alone.json()) as WorkerCreation).hostId, hostId)

    const second = await secondHost()
    assert.equal((await request('ambiguous')).status, 400)
    assert.equal((await request('asleep', second.id)).status, 503)
    const stray = await ctx.store.hosts.create({ name: 'unassigned' })
    cleanup.push(bus.subscribe(stray.host.id, () => {}))
    assert.equal((await request('stray', stray.host.id)).status, 400)
    const chosen = await request('chosen', hostId)
    assert.equal(chosen.status, 202)

    await ctx.store.hosts.unassign(hostId, workspaceId)
    await ctx.store.hosts.unassign(second.id, workspaceId)
    assert.equal((await request('homeless')).status, 503)
    assert.deepEqual(
      (await ctx.store.workerCreations.listByProject(projectId)).map(item => item.name),
      ['chosen', 'alone'],
    )
  })

  test('a host sees and acts on only its own creations', async () => {
    online()
    const second = await secondHost()
    cleanup.push(bus.subscribe(second.id, () => {}))
    const mine = await create('mine')
    const theirs = (await (await request('theirs', second.id)).json()) as WorkerCreation
    assert.deepEqual(signals, [{ action: 'create', creationId: mine.id }])

    const listed = await app.request('/provisioner/worker-creations', { headers: second.auth })
    assert.deepEqual(
      ((await listed.json()) as WorkerCreation[]).map(item => item.id),
      [theirs.id],
    )
    const path = `/provisioner/worker-creations/${mine.id}`
    assert.equal((await app.request(path, { headers: second.auth })).status, 404)
    const report = { status: 'running', step: 'directory' }
    assert.equal((await postJson(app, `${path}/progress`, report, second.auth)).status, 404)
    await registering(mine)
    const hostname = { hostname: 'mac-2' }
    assert.equal((await postJson(app, `${path}/worker`, hostname, second.auth)).status, 404)
    assert.deepEqual(await ctx.store.workers.listByProject(projectId), [])
  })

  test('each host has one stream of its own', async () => {
    const second = await secondHost()
    online()
    const abort = new AbortController()
    cleanup.push(() => abort.abort())
    const headers = second.auth
    const stream = await app.request('/provisioner/stream', { headers, signal: abort.signal })
    assert.equal(stream.status, 200)
    assert.equal((await app.request('/provisioner/stream', { headers })).status, 409)
    assert.equal((await app.request('/provisioner/stream', { headers: daemon })).status, 409)
    abort.abort()
    await stream.body?.cancel()
  })

  test('replacing a token ends the open stream and frees the host', { timeout: 5000 }, async () => {
    const stale = await app.request('/provisioner/stream', { headers: daemon })
    assert.equal(stale.status, 200)
    const rotated = await postJson(app, `/hosts/${hostId}/token`, {})
    const { token } = (await rotated.json()) as HostCredential
    await stale.text()
    assert.equal(bus.has(hostId), false)
    assert.equal((await app.request('/provisioner/stream', { headers: daemon })).status, 401)

    const abort = new AbortController()
    cleanup.push(() => abort.abort())
    const headers = { authorization: `Bearer ${token}` }
    const fresh = await app.request('/provisioner/stream', { headers, signal: abort.signal })
    assert.equal(fresh.status, 200)
    assert.equal((await app.request('/provisioner/stream', { headers })).status, 409)
    abort.abort()
    await fresh.body?.cancel()
  })

  test('a directory is shared only on the host it lives on', async () => {
    online()
    const second = await secondHost()
    cleanup.push(bus.subscribe(second.id, () => {}))
    await finish(await create('owner'))
    assert.equal((await share(projectId, 'elsewhere', '/mini/project', second.id)).status, 400)
    assert.equal((await share(projectId, 'beside', '/mini/project', hostId)).status, 202)
  })

  test('only an admin manages hosts, and a project sees only those it was given', async () => {
    const admin = await ctx.store.users.create({
      username: 'root',
      passwordHash: 'unused',
      isAdmin: true,
    })
    await ctx.store.users.setApiToken(admin.id, 'admin-token')
    const member = await ctx.store.users.create({ username: 'member', passwordHash: 'unused' })
    await ctx.store.users.setApiToken(member.id, 'member-token')
    await ctx.store.users.bindWorkspace(member.id, workspaceId)
    const asAdmin = { authorization: 'Bearer admin-token' }
    const asMember = { authorization: 'Bearer member-token' }

    assert.equal((await app.request('/hosts', { headers: asMember })).status, 403)
    assert.equal((await postJson(app, '/hosts', { name: 'x' }, asMember)).status, 403)
    assert.equal((await postJson(app, '/hosts', { name: 'mac-1' }, asAdmin)).status, 409)

    const added = await postJson(app, '/hosts', { name: ' mac-3 ' }, asAdmin)
    assert.equal(added.status, 201)
    const { host, token } = (await added.json()) as HostCredential
    assert.equal(host.name, 'mac-3')
    const options = async () =>
      (await (
        await app.request(`/projects/${projectId}/hosts`, { headers: asMember })
      ).json()) as HostOption[]
    assert.deepEqual(await options(), [{ id: hostId, name: 'mac-1', online: false }])

    const assignment = `/hosts/${host.id}/workspaces/${workspaceId}`
    for (const _ of [1, 2])
      assert.equal((await app.request(assignment, { method: 'PUT', headers: asAdmin })).status, 204)
    assert.deepEqual(
      (await options()).map(item => item.name),
      ['mac-1', 'mac-3'],
    )
    const missing = `/hosts/${host.id}/workspaces/${workspaceId + 100}`
    assert.equal((await app.request(missing, { method: 'PUT', headers: asAdmin })).status, 404)
    const listing = await app.request('/hosts', { headers: asAdmin })
    const hosts = (await listing.json()) as AdminHost[]
    assert.deepEqual(hosts.find(item => item.id === host.id)?.workspaceIds, [workspaceId])
    assert.equal(
      hosts.some(item => 'token' in item),
      false,
    )
    await app.request(assignment, { method: 'DELETE', headers: asAdmin })
    assert.equal((await options()).length, 1)

    const before = { authorization: `Bearer ${token}` }
    assert.equal(
      (await app.request('/provisioner/worker-creations', { headers: before })).status,
      200,
    )
    const rotated = await postJson(app, `/hosts/${host.id}/token`, {}, asAdmin)
    const after = { authorization: `Bearer ${((await rotated.json()) as HostCredential).token}` }
    assert.equal(
      (await app.request('/provisioner/worker-creations', { headers: before })).status,
      401,
    )
    assert.equal(
      (await app.request('/provisioner/worker-creations', { headers: after })).status,
      200,
    )
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

  test('offers three profiles and rejects unsupported template/agent pairs before reserving resources', async () => {
    online()
    const templates = (await (
      await app.request(`/projects/${projectId}/worker-templates`)
    ).json()) as WorkerTemplate[]
    assert.deepEqual(templates, [
      {
        id: 'mini-glm-codeplan',
        name: 'GLM Code Plan',
        agentKinds: ['claude-code', 'pi'],
        available: true,
      },
      {
        id: 'mini-dashscope-codeplan',
        name: 'DashScope Code Plan',
        agentKinds: ['claude-code', 'pi'],
        available: true,
      },
      { id: 'mini-codex', name: '本机 Codex', agentKinds: ['codex'], available: true },
    ])
    for (const [templateId, agentKind] of [
      ['mini-glm-codeplan', 'codex'],
      ['mini-dashscope-codeplan', 'codex'],
      ['mini-codex', 'pi'],
      ['mini-codex', 'claude-code'],
      ['unknown', 'codex'],
    ]) {
      const response = await postJson(app, `/projects/${projectId}/worker-creations`, {
        templateId,
        agentKind,
        name: 'invalid',
      })
      assert.equal(response.status, 400)
    }
    assert.deepEqual(await ctx.store.workerCreations.listByProject(projectId), [])
    assert.deepEqual(signals, [])
    for (const template of templates) {
      for (const agentKind of template.agentKinds) {
        const response = await postJson(app, `/projects/${projectId}/worker-creations`, {
          templateId: template.id,
          agentKind,
          name: `${template.id}-${agentKind}`,
        })
        assert.equal(response.status, 202)
        const creation = (await response.json()) as WorkerCreation
        assert.equal(creation.templateId, template.id)
        assert.equal(creation.agentKind, agentKind)
      }
    }
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
    const otherApp = createApp(ctx.store)
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
    assert.deepEqual(await ctx.store.workerCreations.worklist(hostId), [])
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
    assert.equal((await app.request('/hosts', { headers: workerAuth })).status, 403)
    assert.equal((await postJson(app, `/hosts/${hostId}/token`, {}, workerAuth)).status, 403)
    assert.equal((await app.request('/hosts', { headers: daemon })).status, 401)
    assert.equal(
      (await progress(creation.id, { status: 'running', step: 'directory' })).status,
      200,
    )
  })

  test('failed replay closes the stream and reconnect recovers unchanged requests', async t => {
    const stop = bus.subscribe(hostId, () => {})
    const pending = await create('pending')
    const running = await create('running')
    assert.equal((await progress(running.id, { status: 'running', step: 'directory' })).status, 200)
    const before = await ctx.store.workerCreations.listByProject(projectId)
    stop()
    const worklist = ctx.store.workerCreations.worklist
    let failNext = true
    t.mock.method(ctx.store.workerCreations, 'worklist', async (id: number) => {
      if (failNext) {
        failNext = false
        throw new Error('temporary replay read failure')
      }
      return worklist(id)
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
      assert.equal(bus.has(hostId), false)
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

  test('SSE reconnect distinguishes creation from inspection and only admits one stream', async () => {
    const stop = bus.subscribe(hostId, () => {})
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
    assert.equal(bus.has(hostId), false)
    assert.equal((await ctx.store.workerCreations.get(running.id))?.status, 'running')
  })
})
