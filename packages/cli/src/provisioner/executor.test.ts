import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { WorkerCreation, WorkerCreationReport } from '@baton/shared'
import type { ProvisionerClient } from './client.ts'
import { loadProvisionerConfig, type ProvisionerConfig } from './config.ts'
import { provisionWorker } from './executor.ts'
import { installProvisionerAgent } from './launchd.ts'

const dirs: string[] = []
afterEach(async () => {
  mock.restoreAll()
  syncBuiltinESMExports()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
const mac = { skip: process.platform !== 'darwin' }

const fixture = async (launchFails = false) => {
  const dir = await mkdtemp(join(os.tmpdir(), 'baton-provisioner-'))
  dirs.push(dir)
  const home = join(dir, 'home')
  mock.method(os, 'homedir', () => home)
  syncBuiltinESMExports()
  const bin = join(dir, 'bin')
  await mkdir(bin)
  await writeFile(
    join(bin, 'launchctl'),
    `#!/bin/sh
if [ "$1" = "print" ]; then
  echo 'Could not find service' >&2
  exit 113
fi
exit ${launchFails ? 1 : 0}
`,
    { mode: 0o700 },
  )
  const config: ProvisionerConfig = {
    server: 'http://localhost:3280/api',
    token: 'provisioner-secret',
    projectsRoot: join(dir, 'projects'),
    cliPath: process.execPath,
    workerEnv: { PATH: `${bin}:/usr/bin:/bin`, ANTHROPIC_AUTH_TOKEN: 'agent<&secret' },
  }
  const creation: WorkerCreation = {
    id: 9,
    projectId: 3,
    name: '中文 worker / &',
    templateId: 'mini-local',
    agentKind: 'codex',
    machineId: 'stable-id',
    status: 'pending',
    step: null,
    repoPath: null,
    workerId: null,
    error: null,
    createdAt: 0,
    updatedAt: 0,
    finishedAt: null,
  }
  const reports: WorkerCreationReport[] = []
  const worker = {
    id: 7,
    projectId: 3,
    name: creation.name,
    agentKind: creation.agentKind,
    machineId: creation.machineId,
    hostname: 'mini',
    createdAt: 0,
    connected: true,
  }
  const client: ProvisionerClient = {
    get: async () => creation,
    report: async (_id, report) => {
      reports.push(report)
      return { ...creation, ...report }
    },
    register: async () => ({ worker, apiToken: 'worker-secret' }),
    worker: async (_id, token) => {
      assert.equal(token, 'worker-secret')
      return worker
    },
  }
  const repo = join(config.projectsRoot, 'project-3/creation-9')
  const plist = join(home, 'Library/LaunchAgents/dev.fmap.baton-worker-creation-9.plist')
  return { config, creation, reports, client, worker, repo, plist, dir, bin, home }
}

test(
  'creates a usable local Git repo, stable config and private credential-separated plist',
  mac,
  async () => {
    const f = await fixture()
    await provisionWorker(f.config, f.creation, f.client, new AbortController().signal)
    assert.deepEqual(
      f.reports.map(report => (report.status === 'running' ? report.step : report.status)),
      ['directory', 'git', 'register', 'start', 'connect', 'succeeded'],
    )
    assert.equal(
      execFileSync('git', ['-C', f.repo, 'branch', '--show-current'], { encoding: 'utf8' }).trim(),
      'main',
    )
    assert.equal(
      execFileSync('git', ['-C', f.repo, 'status', '--porcelain'], { encoding: 'utf8' }),
      '',
    )
    assert.equal(execFileSync('git', ['-C', f.repo, 'remote'], { encoding: 'utf8' }), '')
    const worktree = join(f.dir, 'session')
    execFileSync('git', ['-C', f.repo, 'worktree', 'add', '-b', 'session', worktree, 'main'])
    assert.ok(existsSync(join(worktree, '.git')))
    const cfgText = await readFile(join(f.repo, '.baton.json'), 'utf8')
    const cfg = JSON.parse(cfgText)
    assert.equal(cfg.worker.machineId, f.creation.machineId)
    assert.equal(cfg.worker.apiToken, 'worker-secret')
    assert.equal(cfgText.includes(f.config.token), false)
    assert.equal((await stat(join(f.repo, '.baton.json'))).mode & 0o777, 0o600)
    assert.equal((await stat(f.plist)).mode & 0o777, 0o600)
    const agent = JSON.parse(
      execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', f.plist], {
        encoding: 'utf8',
      }),
    )
    assert.equal(agent.WorkingDirectory, f.repo)
    assert.deepEqual(agent.ProgramArguments, [process.execPath, process.execPath, 'worker', 'run'])
    assert.equal(agent.EnvironmentVariables.HOME, f.home)
    assert.equal(agent.EnvironmentVariables.ANTHROPIC_AUTH_TOKEN, 'agent<&secret')
    assert.equal(JSON.stringify(agent).includes(f.config.token), false)
    assert.equal(
      await readFile(join(agent.EnvironmentVariables.XDG_DATA_HOME, 'baton/machine-id'), 'utf8'),
      'stable-id\n',
    )
  },
)

test(
  'rejects an existing repository and a symlink project without touching their contents',
  mac,
  async () => {
    const f = await fixture()
    await mkdir(f.repo, { recursive: true })
    await writeFile(join(f.repo, 'keep.txt'), 'keep')
    await assert.rejects(
      provisionWorker(f.config, f.creation, f.client, new AbortController().signal),
      { code: 'EEXIST' },
    )
    assert.equal(await readFile(join(f.repo, 'keep.txt'), 'utf8'), 'keep')
    assert.equal(f.reports.length, 1)
    const outside = join(f.dir, 'outside')
    await mkdir(outside)
    await symlink(outside, join(f.config.projectsRoot, 'project-4'))
    await assert.rejects(
      provisionWorker(
        f.config,
        { ...f.creation, projectId: 4 },
        f.client,
        new AbortController().signal,
      ),
      /unsafe directory/,
    )
    assert.equal(existsSync(join(outside, 'creation-9')), false)
  },
)

test(
  'Git failure stops before registration and launchd failure retains the registered resources',
  mac,
  async () => {
    const f = await fixture(true)
    await writeFile(join(f.bin, 'git'), '#!/bin/sh\nexit 2\n', { mode: 0o700 })
    await assert.rejects(
      provisionWorker(f.config, f.creation, f.client, new AbortController().signal),
      /Git repository initialization failed/,
    )
    assert.ok(existsSync(f.repo))
    assert.deepEqual(
      f.reports.map(r => (r.status === 'running' ? r.step : r.status)),
      ['directory', 'git'],
    )
    await rm(join(f.bin, 'git'))
    const second = { ...f.creation, id: 10 }
    await assert.rejects(
      provisionWorker(f.config, second, f.client, new AbortController().signal),
      /launchd start failed/,
    )
    assert.ok(existsSync(join(f.config.projectsRoot, 'project-3/creation-10/.baton.json')))
    assert.ok(
      existsSync(join(f.home, 'Library/LaunchAgents/dev.fmap.baton-worker-creation-10.plist')),
    )
  },
)

test(
  'connection timeout retains the worker configuration and never reports success',
  mac,
  async t => {
    const f = await fixture()
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 })
    const polling = Promise.withResolvers<void>()
    f.client.worker = async () => {
      polling.resolve()
      return { ...f.worker, connected: false }
    }
    const timedOut = assert.rejects(
      provisionWorker(f.config, f.creation, f.client, new AbortController().signal),
      /did not connect/,
    )
    await Promise.race([polling.promise, timedOut])
    await setImmediate()
    t.mock.timers.tick(60_001)
    await timedOut
    assert.ok(existsSync(join(f.repo, '.baton.json')))
    assert.equal(f.reports.at(-1)?.status, 'running')
    assert.equal(
      f.reports.some(r => r.status === 'succeeded'),
      false,
    )
  },
)

test(
  'private config validates worker environment and install refuses to overwrite an existing plist',
  mac,
  async () => {
    const f = await fixture()
    const configPath = join(f.dir, 'provisioner.json')
    await writeFile(configPath, JSON.stringify(f.config), { mode: 0o600 })
    const loaded = await loadProvisionerConfig(configPath)
    assert.equal(loaded.server, f.config.server)
    await installProvisionerAgent(loaded, configPath)
    const plist = join(f.home, 'Library/LaunchAgents/dev.fmap.baton-provisioner.plist')
    const before = await readFile(plist, 'utf8')
    await assert.rejects(installProvisionerAgent(loaded, configPath), { code: 'EEXIST' })
    assert.equal(await readFile(plist, 'utf8'), before)
    const agent = JSON.parse(
      execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist], { encoding: 'utf8' }),
    )
    assert.equal(JSON.stringify(agent).includes(f.config.token), false)
    await writeFile(
      configPath,
      JSON.stringify({ ...f.config, workerEnv: { BATON_PROVISIONER_TOKEN: 'bad' } }),
    )
    await assert.rejects(loadProvisionerConfig(configPath), /invalid worker environment key/)
  },
)
