import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { Attachment, Session, WorkerCommand } from '@baton/shared'
import { createApp } from '../app.ts'
import { createAttachmentStore } from '../attachments.ts'
import { hashPassword } from '../auth/password.ts'
import { createCommandBus } from '../command-bus.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { postJson } from './test-helpers.ts'

const cookieFrom = (res: Response): string =>
  (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''

// A share link grants exactly one session on a fixed route allowlist — never a
// user identity, never its workspace, and never on top of (or instead of) a login.
describe('server HTTP — share grant', () => {
  let ctx: TestStore
  let dataDir: string
  beforeEach(async () => {
    ctx = await freshStore()
    dataDir = mkdtempSync(join(tmpdir(), 'baton-share-'))
  })
  afterEach(async () => {
    await ctx.cleanup()
    rmSync(dataDir, { recursive: true, force: true })
  })

  const setup = async () => {
    const commands = createCommandBus()
    const app = createApp(ctx.store, {
      commands,
      attachments: createAttachmentStore(dataDir),
    })
    const ws = await ctx.store.workspaces.create({ name: 'ws' })
    const project = await ctx.store.projects.create({ workspaceId: ws.id, name: 'p' })
    const reg = await ctx.store.workers.register({
      projectId: project.id,
      machineId: 'mid',
      name: 'w',
      hostname: 'h',
    })
    if (reg.kind === 'name-collision') throw new Error('unexpected worker name collision')
    const newSession = (name: string) =>
      ctx.store.sessions.create({
        projectId: project.id,
        workerId: reg.worker.id,
        mode: 'worker',
        name,
        agentKind: 'claude-code',
      })
    const shared = await newSession('shared')
    const sibling = await newSession('sibling')
    // A user exists → the cookie gate is on.
    await ctx.store.users.create({
      username: 'root',
      passwordHash: hashPassword('pw'),
      isAdmin: true,
    })
    const open = async (s: Session) => {
      const res = await postJson(app, `/auth/share/${s.shareToken}`, {})
      assert.equal(res.status, 200)
      return cookieFrom(res)
    }
    return { app, commands, project, worker: reg.worker, shared, sibling, open }
  }

  test('opens only its session on the allowlist; no identity, no workspace', async () => {
    const { app, project, worker, shared, sibling, open } = await setup()
    const cookie = await open(shared)
    assert.match(cookie, new RegExp(`^baton_share_${shared.id}=`))
    const get = (path: string) => app.request(path, { headers: { cookie } })
    const send = (method: string, path: string, body: unknown = {}) =>
      app.request(path, {
        method,
        body: JSON.stringify(body),
        headers: { cookie, 'content-type': 'application/json' },
      })

    assert.equal((await get('/auth/me')).status, 401)
    for (const path of ['', '/events', '/events?limit=10', '/queue'])
      assert.equal((await get(`/sessions/${shared.id}${path}`)).status, 200, path)
    // SSE ends on client abort; only the auth outcome matters here.
    const abort = new AbortController()
    const stream = await app.request(`/sessions/${shared.id}/stream?live=1`, {
      headers: { cookie },
      signal: abort.signal,
    })
    assert.equal(stream.status, 200)
    abort.abort()

    for (const path of [
      `/sessions/${sibling.id}`,
      `/sessions/${sibling.id}/events`,
      '/workspaces',
      `/projects/${project.id}`,
      `/projects/${project.id}/sessions`,
      `/workers/${worker.id}/branches`,
      `/sessions/${shared.id}/terminal/ws`,
    ])
      assert.equal((await get(path)).status, 401, path)
    for (const [method, path, body] of [
      ['POST', `/sessions/${sibling.id}/messages`, { text: 'hi' }],
      ['POST', `/sessions/${shared.id}/rename`, { name: 'x' }],
      ['POST', `/sessions/${shared.id}/mode`, { planMode: true }],
      ['POST', `/sessions/${shared.id}/model`, { model: 'opus' }],
      ['POST', `/sessions/${shared.id}/abort`],
      ['POST', `/sessions/${shared.id}/clear`],
      ['POST', `/sessions/${shared.id}/resume`],
      ['POST', `/sessions/${shared.id}/stop`],
      ['POST', `/sessions/${shared.id}/terminal`, { action: 'open' }],
      ['DELETE', `/sessions/${shared.id}/queue/1`],
      ['DELETE', `/sessions/${shared.id}`],
      ['POST', '/sessions', { projectId: project.id, workerId: worker.id }],
    ] as const)
      assert.equal((await send(method, path, body)).status, 401, `${method} ${path}`)
    // The grant is bound to the session's current share token, not the cookie name.
    const moved = cookie.replace(`baton_share_${shared.id}=`, `baton_share_${sibling.id}=`)
    assert.equal(
      (await app.request(`/sessions/${sibling.id}`, { headers: { cookie: moved } })).status,
      401,
    )
  })

  test('guest sends messages and attachments; a stopped session auto-starts', async () => {
    const { app, commands, worker, shared, sibling, open } = await setup()
    const cookie = await open(shared)
    const seen: WorkerCommand[] = []
    const unsubscribe = commands.subscribe(worker.id, command => seen.push(command))
    try {
      const up = await app.request(`/sessions/${shared.id}/attachments?filename=a.txt`, {
        method: 'POST',
        body: new TextEncoder().encode('bytes'),
        headers: { cookie, 'content-type': 'text/plain' },
      })
      assert.equal(up.status, 201)
      const meta = (await up.json()) as Attachment
      const dl = await app.request(meta.url, { headers: { cookie } })
      assert.equal(await dl.text(), 'bytes')

      const message = (body: unknown) =>
        postJson(app, `/sessions/${shared.id}/messages`, body, { cookie })
      assert.equal((await message({ text: 'look', attachments: [meta] })).status, 201)
      assert.ok(seen.some(c => c.cmd === 'session.start' && c.sessionId === shared.id))
      assert.equal((await message({ text: '  /clear' })).status, 400)
      assert.equal((await message({ text: '/model opus' })).status, 400)
      // Message routes for other sessions stay closed even with a valid grant here.
      const other = await postJson(
        app,
        `/sessions/${sibling.id}/messages`,
        { text: 'x' },
        { cookie },
      )
      assert.equal(other.status, 401)
    } finally {
      unsubscribe()
    }
  })

  test('grants stack per session and never replace or widen a login', async () => {
    const { app, shared, sibling, open } = await setup()
    const both = `${await open(shared)}; ${await open(sibling)}`
    for (const s of [shared, sibling])
      assert.equal(
        (await app.request(`/sessions/${s.id}`, { headers: { cookie: both } })).status,
        200,
      )

    // alice is logged in but bound to no workspace.
    await ctx.store.users.create({
      username: 'alice',
      passwordHash: hashPassword('pw'),
      isAdmin: false,
    })
    const login = cookieFrom(
      await postJson(app, '/auth/login', { username: 'alice', password: 'pw' }),
    )
    const res = await postJson(app, `/auth/share/${shared.shareToken}`, {}, { cookie: login })
    const cookie = `${login}; ${cookieFrom(res)}`
    assert.doesNotMatch(res.headers.get('set-cookie') ?? '', /baton_session=/)
    const me = (await (await app.request('/auth/me', { headers: { cookie } })).json()) as {
      user: { username: string }
    }
    assert.equal(me.user.username, 'alice')
    assert.equal((await app.request(`/sessions/${shared.id}`, { headers: { cookie } })).status, 200)
    assert.equal(
      (await app.request(`/sessions/${sibling.id}`, { headers: { cookie } })).status,
      404,
    )
    const rename = await postJson(app, `/sessions/${shared.id}/rename`, { name: 'x' }, { cookie })
    assert.equal(rename.status, 404)
  })
})
