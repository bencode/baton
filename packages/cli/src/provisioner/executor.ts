import { execFile } from 'node:child_process'
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { WorkerCreation, WorkerCreationStep } from '@baton/shared'
import { workerProjectConfig } from '../project-config.ts'
import type { ProvisionerClient } from './client.ts'
import { commandEnvironment, type ProvisionerConfig } from './config.ts'
import { launchWorkerAgent, workerStatePath } from './launchd.ts'

const directory = async (path: string): Promise<void> => {
  try {
    await mkdir(path, { mode: 0o700 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`unsafe directory: ${path}`)
}

export const provisionWorker = async (
  config: ProvisionerConfig,
  creation: WorkerCreation,
  client: ProvisionerClient,
  signal: AbortSignal,
): Promise<void> => {
  const repoPath = join(
    config.projectsRoot,
    `project-${creation.projectId}`,
    `creation-${creation.id}`,
  )
  const progress = (step: WorkerCreationStep) =>
    client.report(creation.id, { status: 'running', step, repoPath }, signal)
  await progress('directory')
  signal.throwIfAborted()
  await mkdir(config.projectsRoot, { recursive: true, mode: 0o700 })
  const root = await realpath(config.projectsRoot)
  await directory(join(root, `project-${creation.projectId}`))
  await mkdir(join(root, `project-${creation.projectId}`, `creation-${creation.id}`), {
    mode: 0o700,
  })
  await progress('git')
  const git = async (args: string[]) => {
    try {
      await promisify(execFile)('git', ['-C', repoPath, ...args], {
        env: commandEnvironment(config),
        signal,
        timeout: 10_000,
      })
    } catch (error) {
      signal.throwIfAborted()
      throw new Error('Git repository initialization failed', { cause: error })
    }
  }
  await git(['init', '-b', 'main'])
  await writeFile(join(repoPath, '.git/info/exclude'), '\n.baton.json\n', { flag: 'a' })
  await git([
    '-c',
    'user.name=Baton',
    '-c',
    'user.email=baton@localhost',
    'commit',
    '--allow-empty',
    '-m',
    'chore: initialize repository',
  ])
  await progress('register')
  const result = await client.register(creation.id, hostname(), signal)
  const state = workerStatePath(config, creation)
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
  await writeFile(join(repoPath, '.baton.json'), `${JSON.stringify(cfg, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  await progress('start')
  signal.throwIfAborted()
  await launchWorkerAgent(config, creation, repoPath, signal)
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
