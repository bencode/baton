import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { type ApiClient, createClient } from '../client.ts'
import type { WorkerConfig } from '../project-config.ts'
import { sessionRuntimeDir } from './runtime-paths.ts'
import { readRunnerRecord, writeRunnerRecord } from './session-process.ts'
import { createSessionSupervisor } from './session-supervisor.ts'

const cfg: WorkerConfig = {
  server: 'http://localhost:3280',
  projectId: 1,
  workerId: 9,
  agentKind: 'codex',
  name: 'test-worker',
  machineId: 'mid-test',
  apiToken: 'worker-token',
}

const idle = {
  paused: false,
  contextResetRequested: false,
  pendingCount: 0,
  turn: null,
  attempt: null,
}

for (const git of [false, true]) {
  test(`shared directory sessions start and delete safely (unborn Git: ${git})`, {
    timeout: 20_000,
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'baton-shared-cwd-'))
    const cwd = join(root, 'project')
    await mkdir(cwd)
    if (git) execFileSync('git', ['init', '-q', cwd])
    await writeFile(join(cwd, '.baton.json'), 'project-config-sentinel')
    const sessions = new Map(
      [101, 102].map(id => [
        id,
        {
          id,
          workerId: cfg.workerId,
          agentKind: 'codex',
          name: `session-${id}`,
          agentSessionId: null as string | null,
          cwd: null as string | null,
        },
      ]),
    )
    let markActive: () => void = () => {}
    const active = new Set<number>()
    const bothActive = new Promise<void>(resolve => {
      markActive = resolve
    })
    const server = createServer(async (request, response) => {
      const parts = new URL(request.url ?? '/', 'http://localhost').pathname.split('/')
      const id = Number(parts[2])
      const json = (value: unknown) => {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify(value))
      }
      if (parts[3] === 'stream') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.flushHeaders()
      } else if (parts[3] === 'execution') json(idle)
      else if (parts[3] === 'turns') json({ kind: 'idle' })
      else if (parts[3] === 'status') {
        active.add(id)
        if (active.size === 2) markActive()
        json({ ok: true })
      } else if (request.method === 'PATCH') {
        let body = ''
        for await (const chunk of request) body += chunk
        Object.assign(sessions.get(id) ?? {}, JSON.parse(body))
        json(sessions.get(id))
      } else json(sessions.get(id))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const owner = { ...cfg, server: `http://127.0.0.1:${address.port}` }
    const oldXdg = process.env.XDG_DATA_HOME
    process.env.XDG_DATA_HOME = join(root, 'state')
    const supervisor = createSessionSupervisor({
      cfg: owner,
      client: createClient(owner.server),
      cwd,
      log: () => {},
      hasTerminal: () => false,
      closeTerminal: () => {},
    })
    try {
      await Promise.all([supervisor.start(101, 'first'), supervisor.start(102, 'second')])
      await bothActive
      assert.equal(sessions.get(101)?.cwd, cwd)
      assert.equal(sessions.get(102)?.cwd, cwd)
      assert.notEqual(sessions.get(101)?.agentSessionId, sessions.get(102)?.agentSessionId)
      const first = await readRunnerRecord(sessionRuntimeDir(owner, 101))
      const second = await readRunnerRecord(sessionRuntimeDir(owner, 102))
      assert.ok(first && second)
      assert.notEqual(first.pid, second.pid)
      const originalId = sessions.get(101)?.agentSessionId
      await supervisor.stop(101)
      await supervisor.start(101, 'first')
      assert.equal(sessions.get(101)?.agentSessionId, originalId)
      await supervisor.remove(101)
      assert.equal(await readFile(join(cwd, '.baton.json'), 'utf8'), 'project-config-sentinel')
      await assert.rejects(access(sessionRuntimeDir(owner, 101)), { code: 'ENOENT' })
      assert.doesNotThrow(() => process.kill(second.pid, 0))
      await access(sessionRuntimeDir(owner, 102))
    } finally {
      await supervisor.killAll()
      if (oldXdg === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = oldXdg
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('duplicate starts share work and stop cancels materialization', async () => {
  let release: () => void = () => {}
  const blocked = new Promise<void>(resolve => {
    release = resolve
  })
  let gets = 0
  const client = {
    sessions: {
      get: async () => {
        gets++
        await blocked
        return { agentSessionId: null, cwd: null }
      },
      execution: async () => idle,
      materialize: async () => {
        assert.fail('canceled Session must not materialize')
      },
    },
  } as unknown as ApiClient
  const supervisor = createSessionSupervisor({
    client,
    cfg,
    cwd: process.cwd(),
    log: () => {},
    hasTerminal: () => false,
    closeTerminal: () => {},
  })
  const first = supervisor.start(100001, 'first')
  assert.equal(supervisor.start(100001, 'first'), first)
  const stopped = supervisor.stop(100001)
  release()
  await first
  await stopped
  assert.equal(gets, 1)
  assert.equal(supervisor.has(100001), false)
})

test('recovery confirms a recorded runner has exited before acknowledging stop; missing identity blocks', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'baton-recovery-test-'))
  const oldXdg = process.env.XDG_DATA_HOME
  process.env.XDG_DATA_HOME = cwd
  const runnerToken = randomUUID()
  const child = spawn(
    process.execPath,
    [
      '-e',
      'process.send("ready"); setInterval(() => {}, 1000)',
      '--',
      '--runner-token',
      runnerToken,
    ],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  )
  const exited = once(child, 'exit')
  let stopping = true
  let acknowledgements = 0
  try {
    await once(child, 'message')
    assert.ok(child.pid)
    const pid = child.pid
    const client = {
      sessions: {
        get: async () => ({ id: 101, workerId: cfg.workerId, cwd, name: 'test' }),
        execution: async () => ({
          paused: true,
          contextResetRequested: false,
          pendingCount: 2,
          turn: stopping ? { id: 1, status: 'running' } : null,
          attempt: stopping ? { id: 2, status: 'stopping', runnerToken, stopRequestedAt: 0 } : null,
        }),
        stopped: async () => {
          assert.throws(() => process.kill(-pid, 0), { code: 'ESRCH' })
          acknowledgements++
          stopping = false
          return { outcome: 'aborted' }
        },
      },
    } as unknown as ApiClient
    const supervisor = createSessionSupervisor({
      client,
      cfg,
      cwd: process.cwd(),
      log: () => {},
      hasTerminal: () => false,
      closeTerminal: () => {},
    })
    await assert.rejects(supervisor.reconcile(101), /missing record/)
    assert.equal(acknowledgements, 0)
    assert.doesNotThrow(() => process.kill(pid, 0))
    await mkdir(sessionRuntimeDir(cfg, 101), { recursive: true })
    await writeRunnerRecord(sessionRuntimeDir(cfg, 101), {
      server: cfg.server,
      workerId: cfg.workerId,
      sessionId: 101,
      runnerToken,
      pid,
      pgid: pid,
    })
    await supervisor.reconcile(101)
    await exited
    assert.equal(acknowledgements, 1)
    assert.equal(supervisor.has(101), false)
    await supervisor.reconcile(101)
    assert.equal(acknowledgements, 1)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
    if (oldXdg === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = oldXdg
    await rm(cwd, { recursive: true, force: true })
  }
})
