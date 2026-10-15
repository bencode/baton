import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { ServiceReport } from '@baton/shared'
import type { WorkerConfig } from '../project-config.ts'
import { workerRuntimeDir } from './runtime-paths.ts'
import { createServiceSupervisor } from './service-supervisor.ts'

const waitForText = async (path: string, pattern: RegExp): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (existsSync(path) && pattern.test(readFileSync(path, 'utf8'))) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`expected log output at ${path}`)
}

const cfg: WorkerConfig = {
  server: 'http://localhost:3280',
  projectId: 1,
  workerId: 9,
  agentKind: 'codex',
  name: 'test-worker',
  machineId: 'mid-test',
  apiToken: 'worker-token',
}

const serviceCommand = (ignoreSigterm = false): string[] => [
  process.execPath,
  '-e',
  `console.log('ready'); ${ignoreSigterm ? "process.on('SIGTERM', () => {}); " : ''}setInterval(() => {}, 1000)`,
]

describe('service supervisor', () => {
  const dirs: string[] = []
  let oldXdg: string | undefined
  beforeEach(() => {
    oldXdg = process.env.XDG_DATA_HOME
  })
  afterEach(() => {
    if (oldXdg === undefined) delete process.env.XDG_DATA_HOME
    else process.env.XDG_DATA_HOME = oldXdg
    dirs.splice(0).forEach(dir => {
      rmSync(dir, { recursive: true, force: true })
    })
  })

  const createHarness = () => {
    const worktree = mkdtempSync(join(tmpdir(), 'baton-service-'))
    dirs.push(worktree)
    process.env.XDG_DATA_HOME = join(worktree, 'state')
    const reports: ServiceReport[] = []
    const supervisor = createServiceSupervisor({
      sendReport: async report => {
        reports.push(report)
      },
      cfg,
      log: () => {},
    })
    return { worktree, reports, supervisor }
  }

  test('starts, reports, and force-stops the managed process group', {
    timeout: 10_000,
  }, async () => {
    const { worktree, reports, supervisor } = createHarness()

    await supervisor.run(
      'run-1',
      worktree,
      'web',
      serviceCommand(true),
      'https://jingzhe.fmap.dev',
      'Spec Factory preview',
    )
    const logPath = join(workerRuntimeDir(cfg), 'services', 'web.log')
    assert.equal(existsSync(logPath), true)
    await waitForText(logPath, /ready/)
    const running = reports.find(report => report.result?.requestId === 'run-1')
    assert.deepEqual(running?.services, [
      {
        cwd: worktree,
        name: 'web',
        startedAt: running?.services[0]?.startedAt,
        publicUrl: 'https://jingzhe.fmap.dev',
        note: 'Spec Factory preview',
      },
    ])
    assert.deepEqual(running?.result?.ok && running.result.service, {
      workerId: cfg.workerId,
      cwd: worktree,
      name: 'web',
      startedAt: running.services[0]?.startedAt,
      publicUrl: 'https://jingzhe.fmap.dev',
      note: 'Spec Factory preview',
    })

    await supervisor.stop('stop-1', 'web')
    assert.equal(
      reports.some(report => report.result?.requestId === 'stop-1'),
      true,
    )
    assert.deepEqual(reports.at(-1)?.services, [])
  })

  test('parallel requests start only one service with the same name', async () => {
    const { worktree, reports, supervisor } = createHarness()
    try {
      await Promise.all([
        supervisor.run('one', worktree, 'web', serviceCommand()),
        supervisor.run('two', worktree, 'web', serviceCommand()),
      ])
      const results = reports.flatMap(report => (report.result ? [report.result] : []))
      assert.equal(results.filter(result => result.ok).length, 1)
      assert.equal(results.filter(result => !result.ok && result.status === 409).length, 1)
      await supervisor.report()
      assert.equal(reports.at(-1)?.services.length, 1)
    } finally {
      await supervisor.stop('cleanup', 'web')
    }
  })

  test('invalid directory leaves the name available for a corrected request', async () => {
    const { worktree, reports, supervisor } = createHarness()
    await supervisor.run('bad', join(worktree, 'missing'), 'web', serviceCommand())
    const failure = reports.find(report => report.result?.requestId === 'bad')?.result
    assert.ok(failure && !failure.ok && failure.status === 400)
    await supervisor.run('fixed', worktree, 'web', serviceCommand())
    await supervisor.stop('cleanup', 'web')
  })

  test('failed launch reports an error without leaving a ghost service', async () => {
    const { worktree, reports, supervisor } = createHarness()

    await supervisor.run('run-broken', worktree, 'broken', ['/definitely/missing/baton-service'])
    await supervisor.report()

    const failure = reports.find(report => report.result?.requestId === 'run-broken')?.result
    assert.equal(failure?.ok, false)
    assert.deepEqual(reports.at(-1)?.services, [])
  })
})

test('a Worker crash disconnects the wrapper and terminates its service', {
  timeout: 20_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'baton-service-crash-'))
  const argv = [
    process.execPath,
    '-e',
    "console.log('pid=' + process.pid); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)",
  ]
  const worker = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
    import { createServiceSupervisor } from ${JSON.stringify(new URL('./service-supervisor.ts', import.meta.url).href)};
    const supervisor = createServiceSupervisor({ cfg: ${JSON.stringify(cfg)}, log: () => {},
      sendReport: async report => { process.send?.(report); } });
    await supervisor.run('start', ${JSON.stringify(root)}, 'web', ${JSON.stringify(argv)});
  `,
    ],
    {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, XDG_DATA_HOME: root },
    },
  )
  const exited = once(worker, 'exit')
  let pid: number | undefined
  try {
    const logPath = await new Promise<string>((resolve, reject) => {
      worker.once('error', reject)
      worker.on('message', message => {
        const result = (message as ServiceReport).result
        if (result?.ok && result.logPath) resolve(result.logPath)
        else if (result && !result.ok) reject(new Error(result.error))
      })
    })
    await waitForText(logPath, /pid=\d+/)
    pid = Number(/pid=(\d+)/.exec(readFileSync(logPath, 'utf8'))?.[1])
    assert.ok(Number.isInteger(pid) && pid > 1)
    worker.kill('SIGKILL')
    await exited
    const deadline = Date.now() + 8_000
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        return
      }
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert.fail('service survived the Worker crash')
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) {
      worker.kill('SIGKILL')
      await exited
    }
    if (pid) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
          console.error('service test cleanup failed', error)
      }
    }
    rmSync(root, { recursive: true, force: true })
  }
})
