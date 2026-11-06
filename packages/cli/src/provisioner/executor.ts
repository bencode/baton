import { execFile } from 'node:child_process'
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { WorkerCreation, WorkerCreationStep } from '@baton/shared'
import { workerProjectConfig } from '../project-config.ts'
import type { ProvisionerClient } from './client.ts'
import { commandEnvironment, type ProvisionerConfig } from './config.ts'
import { launchWorkerAgent, workerStatePath } from './launchd.ts'
import { requireWorkerTemplate, workerTemplateEnvironment } from './worker-template.ts'

const directory = async (path: string): Promise<void> => {
  try {
    await mkdir(path, { mode: 0o700 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`unsafe directory: ${path}`)
}

type Progress = (step: WorkerCreationStep) => Promise<unknown>

const gitIn = async (
  config: ProvisionerConfig,
  repoPath: string,
  args: string[],
  signal: AbortSignal,
  failure = 'Git repository initialization failed',
): Promise<string> => {
  try {
    const { stdout } = await promisify(execFile)('git', ['-C', repoPath, ...args], {
      env: commandEnvironment(config),
      signal,
      timeout: 10_000,
    })
    return stdout
  } catch (error) {
    signal.throwIfAborted()
    throw new Error(failure, { cause: error })
  }
}

const initRepository = async (
  config: ProvisionerConfig,
  creation: WorkerCreation,
  repoPath: string,
  progress: Progress,
  signal: AbortSignal,
): Promise<void> => {
  await progress('directory')
  signal.throwIfAborted()
  await mkdir(config.projectsRoot, { recursive: true, mode: 0o700 })
  const root = await realpath(config.projectsRoot)
  await directory(join(root, `project-${creation.projectId}`))
  await mkdir(join(root, `project-${creation.projectId}`, `creation-${creation.id}`), {
    mode: 0o700,
  })
  await progress('git')
  await gitIn(config, repoPath, ['init', '-b', 'main'], signal)
  await writeFile(join(repoPath, '.git/info/exclude'), '\n.baton.json\n', { flag: 'a' })
  await gitIn(
    config,
    repoPath,
    [
      '-c',
      'user.name=Baton',
      '-c',
      'user.email=baton@localhost',
      'commit',
      '--allow-empty',
      '-m',
      'chore: initialize repository',
    ],
    signal,
  )
}

// The server only offers directories of this project, but the path still decides
// where an agent runs on this machine, so it is checked here before anything else.
const adoptRepository = async (
  config: ProvisionerConfig,
  creation: WorkerCreation,
  repoPath: string,
  progress: Progress,
  signal: AbortSignal,
): Promise<void> => {
  await progress('directory')
  signal.throwIfAborted()
  const real = await realpath(repoPath)
  const project = join(await realpath(config.projectsRoot), `project-${creation.projectId}`)
  if (dirname(real) !== project || !(await lstat(real)).isDirectory())
    throw new Error(`unsafe directory: ${repoPath}`)
  await progress('git')
  const top = await gitIn(
    config,
    real,
    ['rev-parse', '--show-toplevel'],
    signal,
    `not a Git repository: ${repoPath}`,
  )
  if ((await realpath(top.trim())) !== real)
    throw new Error(`not the root of a Git work tree: ${repoPath}`)
}

export const provisionWorker = async (
  config: ProvisionerConfig,
  creation: WorkerCreation,
  client: ProvisionerClient,
  signal: AbortSignal,
): Promise<void> => {
  requireWorkerTemplate(config, creation)
  // A pending creation only has a repoPath when it was asked to share one.
  const shared = creation.repoPath !== null
  const repoPath =
    creation.repoPath ??
    join(config.projectsRoot, `project-${creation.projectId}`, `creation-${creation.id}`)
  const progress = (step: WorkerCreationStep) =>
    client.report(creation.id, { status: 'running', step, repoPath }, signal)
  await (shared ? adoptRepository : initRepository)(config, creation, repoPath, progress, signal)
  await progress('register')
  const result = await client.register(creation.id, hostname(), signal)
  const state = workerStatePath(config, creation)
  const root = await realpath(config.projectsRoot)
  await directory(join(root, '.worker-state'))
  await directory(join(root, '.worker-state', `project-${creation.projectId}`))
  await mkdir(state, { mode: 0o700 })
  await mkdir(join(state, 'baton'), { mode: 0o700 })
  await writeFile(join(state, 'baton/machine-id'), `${creation.machineId}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  const cfg = workerProjectConfig({
    server: config.server,
    projectId: creation.projectId,
    workerId: result.worker.id,
    name: result.worker.name,
    agentKind: result.worker.agentKind,
    machineId: result.worker.machineId,
    apiToken: result.apiToken,
  })
  // `.baton.json` holds one identity, and a shared directory already has its owner's.
  const configPath = shared ? join(state, 'worker.json') : join(repoPath, '.baton.json')
  await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  await progress('start')
  signal.throwIfAborted()
  const workerEnv = await workerTemplateEnvironment(config, creation, state)
  await launchWorkerAgent(config, creation, repoPath, shared ? configPath : null, workerEnv, signal)
  await progress('connect')
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const worker = await client.worker(result.worker.id, result.apiToken, signal)
    if (worker.connected) {
      await client.report(creation.id, { status: 'succeeded' }, signal)
      return
    }
    await setTimeout(1000, undefined, { signal })
  }
  throw new Error('Worker did not connect within 60 seconds')
}
