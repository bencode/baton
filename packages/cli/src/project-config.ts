import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentKind, Id, SessionMode } from '@baton/shared'

// Single local-state file per checkout: `.baton.json` at the repo root.
// Gitignored — holds per-machine identity (worker id + machineId) and
// per-session secrets (apiToken), neither sharable between team members.
// Two clones of the same project on the same machine get two independent
// configs, which is what we want.
//
// Lookup is strictly cwd-only (no upward walk). `--config <path>` is the
// single escape hatch when the user runs from a different directory.
//
// View types (`WorkerConfig`, `SessionConfig`) are flattened projections for
// the daemon / runner — not persisted, derived on demand from the project
// config + sessionId.
export const PROJECT_CONFIG_NAME = '.baton.json'

export type WorkerEntry = {
  id: Id
  name: string
  machineId: string
}

export type SessionEntry = {
  name: string
  apiToken: string
  mode: SessionMode
  agentKind: AgentKind
  agentSessionId: string
  worktreePath: string
}

export type ProjectConfig = {
  server?: string
  workspace?: Id
  project?: Id
  name?: string
  worker?: WorkerEntry
  // Keyed by sessionId stringified (JSON keys are strings; Id is a number).
  sessions?: Record<string, SessionEntry>
}

export type WorkerConfig = {
  server: string
  projectId: Id
  workerId: Id
  name: string
  machineId: string
}

export type SessionConfig = {
  server: string
  apiToken: string
  sessionId: Id
  projectId: Id
  workerId: Id
  name: string
  mode: SessionMode
  agentKind: AgentKind
  agentSessionId: string
  worktreePath: string
  // Cached so the daemon can heartbeat /workers/heartbeat without a re-read.
  workerMachineId: string
}

// Pure path join; no fs touch. Override via --config flag, else default to cwd.
export const projectConfigPath = (cwd: string = process.cwd()): string =>
  join(cwd, PROJECT_CONFIG_NAME)

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

export const addSession = (path: string, id: Id, entry: SessionEntry): void =>
  patch(path, cfg => ({
    ...cfg,
    sessions: { ...(cfg.sessions ?? {}), [String(id)]: entry },
  }))

export const removeSession = (path: string, id: Id): void =>
  patch(path, cfg => {
    const next = { ...(cfg.sessions ?? {}) }
    delete next[String(id)]
    return { ...cfg, sessions: next }
  })

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
  }
}

export const viewSession = (cfg: ProjectConfig, sessionId: Id): SessionConfig => {
  const { server, project, worker } = requireBase(cfg)
  const entry = cfg.sessions?.[String(sessionId)]
  if (!entry) throw new Error(`session #${sessionId} not in local config`)
  return {
    server,
    apiToken: entry.apiToken,
    sessionId,
    projectId: project,
    workerId: worker.id,
    name: entry.name,
    mode: entry.mode,
    agentKind: entry.agentKind,
    agentSessionId: entry.agentSessionId,
    worktreePath: entry.worktreePath,
    workerMachineId: worker.machineId,
  }
}

// Look up a session by int id or name within the local config. Returns the
// numeric id or null. Used by CLI commands that take a positional handle.
export const findSessionId = (cfg: ProjectConfig, handle: number | string): Id | null => {
  const sessions = cfg.sessions ?? {}
  const asInt = typeof handle === 'number' ? handle : Number(handle)
  if (Number.isInteger(asInt) && asInt > 0 && sessions[String(asInt)]) return asInt
  for (const [k, v] of Object.entries(sessions)) {
    if (v.name === String(handle)) return Number(k)
  }
  return null
}
