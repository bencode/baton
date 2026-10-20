import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { FileQuery, WorkerCommand } from '@baton/shared'
import { createApp } from '../app.ts'
import { createCommandBus } from '../command-bus.ts'
import { createFileRequests } from '../file-requests.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { seedWorker } from './test-helpers.ts'

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` })
const ROOT = '0123456789abcdef'

type FilesCommand = Extract<WorkerCommand, { cmd: 'files.query' }>

describe('server HTTP — project files', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  const setup = async (timeoutMs = 2_000) => {
    const commands = createCommandBus()
    const app = createApp(ctx.store, { commands, files: createFileRequests(commands, timeoutMs) })
    const seeded = await seedWorker(app)
    const filesPath = (path: string) =>
      `/projects/${seeded.projectId}/workers/${seeded.workerId}/files/${path}`
    // Resolves with the next files.query the worker receives over its command stream.
    const nextQuery = (): Promise<FilesCommand> =>
      new Promise(resolve => {
        const unsubscribe = commands.subscribe(seeded.workerId, command => {
          if (command.cmd !== 'files.query') return
          unsubscribe()
          resolve(command)
        })
      })
    const report = (token: string, body: unknown) =>
      app.request('/workers/me/files/results', {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', ...auth(token) },
      })
    return { app, commands, seeded, filesPath, nextQuery, report }
  }

  test('a query reaches the worker and its reply comes back to the caller', async () => {
    const { app, seeded, filesPath, nextQuery, report } = await setup()
    const received = nextQuery()
    const response = app.request(filesPath(`view?root=${ROOT}&path=docs%2F%E8%AE%A1%E5%88%92.md`))
    const command = await received
    assert.deepEqual(command.query, {
      op: 'view',
      rootId: ROOT,
      path: 'docs/计划.md',
    } satisfies FileQuery)
    const view = { path: 'docs/计划.md', name: '计划.md', size: 2, kind: 'text', content: 'hi' }
    const put = await report(seeded.workerToken, {
      requestId: command.requestId,
      ok: true,
      data: view,
    })
    assert.equal(put.status, 200)
    const res = await response
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), view)
  })

  test('a reply from another worker is rejected and the caller times out', async () => {
    const { app, seeded, filesPath, nextQuery, report } = await setup(200)
    const other = await ctx.store.workers.register({
      projectId: seeded.projectId,
      machineId: 'mid-other',
      name: 'other',
      hostname: 'h-other',
    })
    if (other.kind === 'name-collision') throw new Error('unexpected worker name collision')
    const received = nextQuery()
    const response = app.request(filesPath('roots'))
    const command = await received
    const forged = await report(other.apiToken, {
      requestId: command.requestId,
      ok: true,
      data: [],
    })
    assert.equal(forged.status, 404)
    const res = await response
    assert.equal(res.status, 504)
    assert.equal(((await res.json()) as { code: string }).code, 'worker_timeout')
  })

  test('an offline worker fails fast, including when its stream drops mid-request', async () => {
    const { app, seeded, filesPath } = await setup(5_000)
    const offline = await app.request(filesPath('roots'))
    assert.equal(offline.status, 409)
    assert.equal(((await offline.json()) as { code: string }).code, 'worker_offline')

    const stream = new AbortController()
    const opened = await app.request('/workers/me/stream', {
      headers: auth(seeded.workerToken),
      signal: stream.signal,
    })
    const reader = opened.body?.getReader()
    const pending = app.request(filesPath('roots'))
    await reader?.read()
    stream.abort()
    const started = Date.now()
    const res = await pending
    assert.equal(res.status, 409)
    assert.ok(Date.now() - started < 2_000)
  })

  test('only users with access to the project may read, and workers may not', async () => {
    const { app, seeded, filesPath } = await setup()
    const workspace = await ctx.store.workspaces.create({ name: 'elsewhere' })
    const project = await ctx.store.projects.create({ workspaceId: workspace.id, name: 'p2' })
    const elsewhere = await ctx.store.workers.register({
      projectId: project.id,
      machineId: 'mid-elsewhere',
      name: 'elsewhere',
      hostname: 'h-elsewhere',
    })
    if (elsewhere.kind === 'name-collision') throw new Error('unexpected worker name collision')
    const crossed = await app.request(
      `/projects/${seeded.projectId}/workers/${elsewhere.worker.id}/files/roots`,
    )
    assert.equal(crossed.status, 404)
    assert.equal((await app.request('/projects/x/workers/1/files/roots')).status, 404)

    const outsider = await ctx.store.users.create({
      username: 'outsider',
      passwordHash: 'x',
      isAdmin: false,
    })
    await ctx.store.users.setApiToken(outsider.id, 'tok-outsider')
    assert.equal(
      (await app.request(filesPath('roots'), { headers: auth('tok-outsider') })).status,
      404,
    )
    assert.equal(
      (await app.request(filesPath('roots'), { headers: auth(seeded.workerToken) })).status,
      403,
    )
  })

  test('malformed queries and malformed worker replies are refused', async () => {
    const { app, seeded, filesPath, nextQuery, report } = await setup()
    for (const path of [
      'list?root=zz',
      `list?root=${ROOT}&path=..%2Fsecret`,
      `view?root=${ROOT}&path=%2Fetc%2Fpasswd`,
      `search?root=${ROOT}&q=%20`,
    ])
      assert.equal((await app.request(filesPath(path))).status, 400, path)

    const received = nextQuery()
    const response = app.request(filesPath('roots'))
    const command = await received
    await report(seeded.workerToken, {
      requestId: command.requestId,
      ok: false,
      code: 'bogus',
      message: 'x',
    })
    const res = await response
    assert.equal(res.status, 502)
    assert.equal(((await res.json()) as { code: string }).code, 'unavailable')
  })
})
