import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Id } from '@baton/shared'

// Single local-state file per checkout: `.baton.json` at the repo root.
// Gitignored — holds this machine's worker identity (id + machineId + apiToken).
// Sessions are NOT stored locally anymore: they're created remotely and the
// server (Session row) is the single source of truth. The worker daemon fetches
// session metadata on demand and authenticates every session write with its own
// worker apiToken.
//
// Lookup is strictly cwd-only (no upward walk). The worker commands' `--config`
// flag is the single escape hatch: point it at an explicit path to run two
// workers from the same directory (each daemon owns a distinct config file →
// distinct identity). Flags don't propagate to child processes, so the agent's
// bare `baton` calls in a worktree still resolve from cwd.
export const PROJECT_CONFIG_NAME = '.baton.json'

export type WorkerEntry = {
  id: Id
  name: string
  machineId: string
  apiToken: string
}

export type ProjectConfig = {
  server?: string
  workspace?: Id
  project?: Id
  name?: string
  worker?: WorkerEntry
}

// Flattened projection for the worker daemon — derived on demand, not persisted.
export type WorkerConfig = {
  server: string
  projectId: Id
  workerId: Id
  name: string
  machineId: string
  apiToken: string
}

// What the session child's run loop needs: where to stream from (server +
// sessionId), what to spawn claude with (worktreePath + agentSessionId), and a
// label (name). Worker credentials are passed straight into the WorkerClient,
// not carried here. agentSessionId/worktreePath are non-null once materialized.
export type SessionConfig = {
  server: string
  sessionId: Id
  name: string
  agentSessionId: string
  worktreePath: string
}

// Pure path join; no fs touch. Default config location: `.baton.json` in cwd.
export const projectConfigPath = (cwd: string = process.cwd()): string =>
  join(cwd, PROJECT_CONFIG_NAME)

// Resolve the worker commands' `--config` flag: an explicit path wins, else the
// cwd default. Shared by `worker register/run/whoami` so they agree.
export const configPathFromArgs = (args: { config?: string }, cwd?: string): string =>
  args.config ?? projectConfigPath(cwd)

export const loadProjectConfig = (path: string): ProjectConfig => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ProjectConfig
  } catch (err) {
    const cause =
      (err as NodeJS.ErrnoException).code === 'ENOENT' ? `not found at ${path}` : String(err)
    throw new Error(`${PROJECT_CONFIG_NAME} ${cause} — run \`baton init\` first`)
  }
}

// Soft variant for callers that tolerate a missing file (e.g. resolving the
// default server URL before init has run).
export const loadProjectConfigOrNull = (path: string): ProjectConfig | null => {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ProjectConfig
  } catch {
    return null
  }
}

export const saveProjectConfig = (path: string, config: ProjectConfig): void => {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

const patch = (path: string, fn: (cfg: ProjectConfig) => ProjectConfig): void => {
  saveProjectConfig(path, fn(loadProjectConfig(path)))
}

export const setWorker = (path: string, w: WorkerEntry): void =>
  patch(path, cfg => ({ ...cfg, worker: w }))

const requireBase = (cfg: ProjectConfig): { server: string; project: Id; worker: WorkerEntry } => {
  if (!cfg.server || !cfg.project || !cfg.worker)
    throw new Error('project-config missing server/project/worker — run `baton worker register`')
  return { server: cfg.server, project: cfg.project, worker: cfg.worker }
}

export const viewWorker = (cfg: ProjectConfig): WorkerConfig => {
  const { server, project, worker } = requireBase(cfg)
  return {
    server,
    projectId: project,
    workerId: worker.id,
    name: worker.name,
    machineId: worker.machineId,
    apiToken: worker.apiToken,
  }
}

// Inverse of viewWorker: the `.baton.json` a worker drops into each session
// worktree so the agent's bare `baton` calls resolve server/project/worker
// from cwd (project-config lookup is strictly cwd-only — no upward walk).
export const worktreeConfig = (cfg: WorkerConfig): ProjectConfig => ({
  server: cfg.server,
  project: cfg.projectId,
  worker: { id: cfg.workerId, name: cfg.name, machineId: cfg.machineId, apiToken: cfg.apiToken },
})
