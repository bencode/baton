import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { WorkerCommand } from '@baton/shared'
import { createApp } from '../app.ts'
import { createCommandBus } from '../command-bus.ts'
import { createServiceRuntime } from '../service-runtime.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson, seedWorker } from './test-helpers.ts'

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` })

describe('server HTTP — services', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('run, list, and stop use worker-scoped live presence', async () => {
    const commands = createCommandBus()
    const services = createServiceRuntime()
    const app = createApp(ctx.store, { commands, services })
    const seeded = await seedWorker(app)
    const unsubscribe = commands.subscribe(seeded.workerId, (command: WorkerCommand) => {
      if (command.cmd === 'service.run') {
        const startedAt = Date.now()
        const service = {
          workerId: seeded.workerId,
          cwd: command.cwd,
          name: command.name,
          startedAt,
          ...(command.publicUrl ? { publicUrl: command.publicUrl } : {}),
          ...(command.note ? { note: command.note } : {}),
        }
        services.replace(seeded.workerId, [service])
        services.resolve({
          requestId: command.requestId,
          ok: true,
          service,
          logPath: '/tmp/web.log',
        })
      } else if (command.cmd === 'service.stop') {
        services.replace(seeded.workerId, [])
        services.resolve({ requestId: command.requestId, ok: true })
      }
    })
    const run = await postJson(
      app,
      `/workers/${seeded.workerId}/services`,
      {
        cwd: '/tmp/service-project',
        name: 'web',
        argv: ['pnpm', 'dev'],
        publicUrl: 'https://jingzhe.fmap.dev',
        note: 'Spec Factory preview',
      },
      auth(seeded.workerToken),
    )
    assert.equal(run.status, 201)
    const listed = (await (
      await app.request(`/projects/${seeded.projectId}/services`, {
        headers: auth(seeded.workerToken),
      })
    ).json()) as Array<{
      name: string
      workerId: number
      startedAt: number
      publicUrl?: string
      note?: string
    }>
    assert.equal(listed.length, 1)
    assert.deepEqual(listed[0], {
      workerId: seeded.workerId,
      cwd: '/tmp/service-project',
      name: 'web',
      startedAt: listed[0]?.startedAt,
      publicUrl: 'https://jingzhe.fmap.dev',
      note: 'Spec Factory preview',
    })

    const session = await ctx.store.sessions.create({
      projectId: seeded.projectId,
      workerId: seeded.workerId,
      mode: 'worker',
      name: 'unrelated',
      agentKind: 'claude-code',
    })
    const deleted = await app.request(`/sessions/${session.id}`, {
      method: 'DELETE',
      headers: auth(seeded.workerToken),
    })
    assert.equal(deleted.status, 204)
    assert.equal(services.listWorker(seeded.workerId).length, 1)

    const stopped = await app.request(`/workers/${seeded.workerId}/services/web`, {
      method: 'DELETE',
      headers: auth(seeded.workerToken),
    })
    assert.equal(stopped.status, 204)
    assert.deepEqual(services.listWorker(seeded.workerId), [])

    const withoutMetadata = await postJson(
      app,
      `/workers/${seeded.workerId}/services`,
      { cwd: '/tmp/service-project', name: 'api', argv: ['pnpm', 'dev:server'] },
      auth(seeded.workerToken),
    )
    assert.equal(withoutMetadata.status, 201)
    assert.deepEqual(services.listWorker(seeded.workerId), [
      {
        workerId: seeded.workerId,
        cwd: '/tmp/service-project',
        name: 'api',
        startedAt: services.listWorker(seeded.workerId)[0]?.startedAt,
      },
    ])

    const heartbeat = await app.request('/workers/me/services', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...auth(seeded.workerToken) },
      body: JSON.stringify({
        services: [
          {
            cwd: '/tmp/service-project',
            name: 'web',
            startedAt: 10,
            publicUrl: 'https://jingzhe.fmap.dev',
            note: 'Spec Factory preview',
          },
          {
            cwd: '/tmp/service-project',
            name: 'api',
            startedAt: 20,
            publicUrl: 'javascript:alert(1)',
            note: 'x'.repeat(501),
          },
        ],
      }),
    })
    assert.equal(heartbeat.status, 200)
    assert.deepEqual(services.listWorker(seeded.workerId), [
      {
        workerId: seeded.workerId,
        cwd: '/tmp/service-project',
        name: 'web',
        startedAt: 10,
        publicUrl: 'https://jingzhe.fmap.dev',
        note: 'Spec Factory preview',
      },
      {
        workerId: seeded.workerId,
        cwd: '/tmp/service-project',
        name: 'api',
        startedAt: 20,
      },
    ])
    unsubscribe()
  })

  test('rejects invalid service metadata', async () => {
    const commands = createCommandBus()
    const app = createApp(ctx.store, { commands, services: createServiceRuntime() })
    const seeded = await seedWorker(app)
    const unsubscribe = commands.subscribe(seeded.workerId, () => {})
    const request = (metadata: Record<string, unknown>) =>
      postJson(
        app,
        `/workers/${seeded.workerId}/services`,
        { cwd: '/tmp/service-project', name: 'web', argv: ['pnpm', 'dev'], ...metadata },
        auth(seeded.workerToken),
      )

    assert.equal((await request({ publicUrl: 'javascript:alert(1)' })).status, 400)
    assert.equal(
      (await request({ publicUrl: `https://example.com/${'x'.repeat(2048)}` })).status,
      400,
    )
    assert.equal((await request({ note: 'x'.repeat(501) })).status, 400)
    for (const cwd of ['', 'relative/path', '/bad\0path'])
      assert.equal((await request({ cwd })).status, 400)
    unsubscribe()
  })
})
