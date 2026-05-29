import { hostname as osHostname } from 'node:os'
import { basename } from 'node:path'
import type { Id } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { createWorkerClient } from '../client.ts'
import { resolveBaseUrl } from '../config.ts'
import {
  loadProjectConfig,
  projectConfigPath,
  type SessionConfig,
  viewSession,
  viewWorker,
  type WorkerConfig,
} from '../project-config.ts'
import { runDaemon } from '../session/runner.ts'
import { clientFor, common, resolveProjectId } from '../util.ts'
import { readOrCreateMachineId } from '../worker/machine-id.ts'
import { newSession } from './session/provision.ts'
import { defaultWorktreeDir, parseEnvPairs } from './session/shared.ts'
import { registerWorker } from './worker.ts'

export type StartInput = {
  projectId: Id
  name?: string
  repo?: string
  resume: boolean
  server: string
  base: string
  worktreeDir: string
  env?: Record<string, string>
}

// Auto-generated session handle when --name is omitted. Pattern:
// "<cwd-basename>-<5 base36 chars>". Random suffix avoids collisions when
// the same repo spawns multiple unrelated sessions.
const autoName = (cwd: string): string => {
  const base =
    basename(cwd)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-') || 'session'
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base}-${suffix}`
}

// Ensure this machine is a registered worker for the project. Idempotent:
// .baton.json#worker short-circuits when present.
const ensureWorker = async (
  client: ApiClient,
  projectId: Id,
  server: string,
  cfgPath: string,
  log: (m: string) => void,
): Promise<WorkerConfig> => {
  const existing = (() => {
    try {
      return loadProjectConfig(cfgPath)
    } catch {
      return null
    }
  })()
  if (existing?.worker) return viewWorker(existing)
  const hostname = osHostname()
  const machineId = readOrCreateMachineId()
  const { out } = await registerWorker(
    client,
    { projectId, name: hostname, server, hostname, machineId },
    cfgPath,
  )
  log(`registered worker #${out.worker.id} (${out.worker.name})`)
  return viewWorker(loadProjectConfig(cfgPath))
}

// Resolve a session by name into a runnable SessionConfig. Three outcomes:
//   - exists + owned by this machine + local entry present → return view
//   - exists but owned by another worker / no local entry → throw
//   - doesn't exist → caller decides (create or strict-fail)
const tryAttach = async (
  client: ApiClient,
  projectId: Id,
  workerCfg: WorkerConfig,
  cfgPath: string,
  name: string,
): Promise<SessionConfig | null> => {
  const existing = await client.sessions.findByName(projectId, name)
  if (!existing) return null
  if (existing.workerId !== workerCfg.workerId)
    throw new Error(
      `session '${name}' belongs to worker #${existing.workerId}; cannot attach from this machine`,
    )
  const cfg = loadProjectConfig(cfgPath)
  if (!cfg.sessions?.[String(existing.id)])
    throw new Error(
      `session #${existing.id} not in local .baton.json; only the original creator can resume`,
    )
  return viewSession(cfg, existing.id)
}

// `baton start` end-to-end. Returns the resolved SessionConfig and a marker
// for whether it was freshly created (test asserts on this).
export const startSession = async (
  client: ApiClient,
  input: StartInput,
  log: (m: string) => void = m => console.log(m),
  cfgPath: string = projectConfigPath(),
): Promise<{ config: SessionConfig; created: boolean }> => {
  const workerCfg = await ensureWorker(client, input.projectId, input.server, cfgPath, log)
  const name = input.name ?? autoName(input.repo ?? process.cwd())
  const attached = await tryAttach(client, input.projectId, workerCfg, cfgPath, name)
  if (attached) {
    log(`attached to session #${attached.sessionId} (${name})`)
    return { config: attached, created: false }
  }
  if (input.resume)
    throw new Error(
      `--resume failed: no session named '${name}' in project ${input.projectId}. ` +
        `omit --resume to create one.`,
    )
  const { config } = await newSession(
    client,
    {
      projectId: input.projectId,
      workerId: workerCfg.workerId,
      workerName: workerCfg.name,
      workerMachineId: workerCfg.machineId,
      name,
      repo: input.repo ?? process.cwd(),
      base: input.base,
      worktreeDir: input.worktreeDir,
      mode: 'worker',
      agentKind: 'claude-code',
      server: input.server,
    },
    undefined,
    cfgPath,
  )
  log(`created session #${config.sessionId} (${name})`)
  log(`  worktree: ${config.worktreePath}`)
  return { config, created: true }
}

export const start = defineCommand({
  meta: {
    name: 'start',
    description: 'start a session (auto-registers worker + creates session if needed)',
  },
  args: {
    name: { type: 'string', description: 'session name (auto-generated if omitted)' },
    repo: { type: 'string', description: 'source repo path (default: cwd)' },
    base: { type: 'string', description: 'base branch / ref (default: main)' },
    resume: {
      type: 'boolean',
      description: 'strict attach: require --name to already exist; do not create',
    },
    'worktree-dir': { type: 'string', description: 'override worktree parent dir' },
    env: {
      type: 'string',
      description: 'env injected into spawned claude (KEY=VAL; CSV-multi or repeat)',
    },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const server = resolveBaseUrl(args.url)
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    if (args.resume && !args.name) throw new Error('--resume requires --name')
    const { config } = await startSession(c, {
      projectId,
      name: args.name,
      repo: args.repo,
      resume: Boolean(args.resume),
      server,
      base: args.base ?? 'main',
      worktreeDir: args['worktree-dir'] ?? defaultWorktreeDir(),
      env: parseEnvPairs(args.env as string | string[] | undefined),
    })
    const runEnv = parseEnvPairs(args.env as string | string[] | undefined)
    const worker = createWorkerClient(config.server, config.apiToken)
    const ac = new AbortController()
    const stop = (): void => ac.abort()
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    const tag = `#${config.sessionId} ${config.name}`
    console.log(`[${tag}] running (worktree: ${config.worktreePath})`)
    if (runEnv) console.log(`[${tag}] env keys: ${Object.keys(runEnv).join(', ')}`)
    await runDaemon(config, { client: c, worker, env: runEnv }, ac.signal)
    console.log(`[${tag}] stopped`)
  },
})
