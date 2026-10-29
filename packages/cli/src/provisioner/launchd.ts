import { execFile } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { WorkerCreation } from '@baton/shared'
import { commandEnvironment, type ProvisionerConfig } from './config.ts'

export const workerStatePath = (config: ProvisionerConfig, creation: WorkerCreation): string =>
  join(
    config.projectsRoot,
    '.worker-state',
    `project-${creation.projectId}`,
    `creation-${creation.id}`,
  )
export const workerLogPath = (creation: WorkerCreation): string =>
  join(homedir(), 'Library/Logs', `baton-worker-creation-${creation.id}.log`)

type Agent = {
  label: string
  args: string[]
  cwd: string
  env: Record<string, string>
  log: string
}

const startAgent = async (
  config: ProvisionerConfig,
  agent: Agent,
  signal?: AbortSignal,
): Promise<void> => {
  signal?.throwIfAborted()
  const plist = join(homedir(), 'Library/LaunchAgents', `${agent.label}.plist`)
  await mkdir(dirname(plist), { recursive: true })
  await mkdir(dirname(agent.log), { recursive: true })
  const domain = `gui/${process.getuid?.()}`
  const env = commandEnvironment(config)
  try {
    await promisify(execFile)('launchctl', ['print', `${domain}/${agent.label}`], {
      env,
      timeout: 10_000,
      signal,
    })
    throw new Error(
      `launchd service already exists: ${agent.label}; stop it manually before installing`,
    )
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        'code' in error &&
        error.code === 113 &&
        'stderr' in error &&
        typeof error.stderr === 'string' &&
        error.stderr.includes('Could not find service')
      )
    )
      throw error
  }
  const handle = await open(plist, 'wx', 0o600)
  try {
    const payload = {
      Label: agent.label,
      ProgramArguments: agent.args,
      WorkingDirectory: agent.cwd,
      EnvironmentVariables: agent.env,
      RunAtLoad: true,
      KeepAlive: true,
      ThrottleInterval: 10,
      StandardOutPath: agent.log,
      StandardErrorPath: agent.log,
    }
    await handle.writeFile(JSON.stringify(payload))
  } finally {
    await handle.close()
  }
  const log = await open(agent.log, 'a', 0o600)
  await log.close()
  try {
    await promisify(execFile)('/usr/bin/plutil', ['-convert', 'xml1', plist], {
      timeout: 10_000,
      signal,
    })
    await promisify(execFile)('/usr/bin/plutil', ['-lint', plist], { timeout: 10_000, signal })
    await promisify(execFile)('launchctl', ['bootstrap', domain, plist], {
      env,
      timeout: 10_000,
      signal,
    })
  } catch {
    throw new Error(`launchd start failed; inspect ${plist} and ${agent.log}`)
  }
}

export const launchWorkerAgent = async (
  config: ProvisionerConfig,
  creation: WorkerCreation,
  repoPath: string,
  workerEnv: Record<string, string>,
  signal?: AbortSignal,
): Promise<void> =>
  startAgent(
    config,
    {
      label: `dev.fmap.baton-worker-creation-${creation.id}`,
      args: [config.nodePath ?? process.execPath, config.cliPath, 'worker', 'run'],
      cwd: repoPath,
      env: {
        PATH: workerEnv.PATH ?? process.env.PATH ?? '/usr/bin:/bin',
        ...workerEnv,
        HOME: homedir(),
        XDG_DATA_HOME: workerStatePath(config, creation),
      },
      log: workerLogPath(creation),
    },
    signal,
  )

export const installProvisionerAgent = async (
  config: ProvisionerConfig,
  configPath: string,
): Promise<void> =>
  startAgent(config, {
    label: 'dev.fmap.baton-provisioner',
    args: [
      config.nodePath ?? process.execPath,
      config.cliPath,
      'provisioner',
      'run',
      '--config',
      configPath,
    ],
    cwd: dirname(configPath),
    env: { HOME: homedir(), PATH: config.workerEnv.PATH ?? process.env.PATH ?? '/usr/bin:/bin' },
    log: join(homedir(), 'Library/Logs/baton-provisioner.log'),
  })
