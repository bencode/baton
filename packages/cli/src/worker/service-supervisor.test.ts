import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import type { ServiceReport } from '@baton/shared'
import type { WorkerConfig } from '../project-config.ts'
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
  afterEach(() =>
    dirs.splice(0).forEach(dir => {
      rmSync(dir, { recursive: true, force: true })
    }),
  )

  const createHarness = () => {
    const worktree = mkdtempSync(join(tmpdir(), 'baton-service-'))
    dirs.push(worktree)
    const reports: ServiceReport[] = []
    const supervisor = createServiceSupervisor({
      getSession: async () => ({ workerId: cfg.workerId, worktreePath: worktree }),
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

    await supervisor.run('run-1', 3, 'web', serviceCommand(true))
    const logPath = join(worktree, '.baton-services', 'web.log')
    assert.equal(existsSync(logPath), true)
    await waitForText(logPath, /ready/)
    assert.equal(
      reports.some(report => report.services.some(service => service.name === 'web')),
      true,
    )

    await supervisor.stop('stop-1', 'web')
    assert.equal(
      reports.some(report => report.result?.requestId === 'stop-1'),
      true,
    )
  })

  test('stopSession removes only services owned by that session', async () => {
    const { reports, supervisor } = createHarness()
    await supervisor.run('run-web', 3, 'web', serviceCommand())
    await supervisor.run('run-api', 4, 'api', serviceCommand())

    await supervisor.stopSession(3)
    await supervisor.report()

    assert.deepEqual(reports.at(-1)?.services, [
      { sessionId: 4, name: 'api', startedAt: reports.at(-1)?.services[0]?.startedAt },
    ])
    await supervisor.stop('stop-api', 'api')
  })

  test('failed launch reports an error without leaving a ghost service', async () => {
    const { reports, supervisor } = createHarness()

    await supervisor.run('run-broken', 3, 'broken', ['/definitely/missing/baton-service'])
    await supervisor.report()

    const failure = reports.find(report => report.result?.requestId === 'run-broken')?.result
    assert.equal(failure?.ok, false)
    assert.deepEqual(reports.at(-1)?.services, [])
  })
})
