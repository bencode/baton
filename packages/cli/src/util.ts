import type { Id } from '@baton/shared'
import { type ApiClient, createClient } from './client.ts'
import { resolveBaseUrl } from './config.ts'
import { loadProjectConfigOrNull, projectConfigPath } from './project-config.ts'

// Shared citty args carried by every command.
export const common = {
  url: {
    type: 'string' as const,
    description: 'baton server url (--url > .baton.json > BATON_URL > http://localhost:3280)',
  },
  json: { type: 'boolean' as const, description: 'output JSON' },
}

// Auth precedence: explicit env wins, then the cwd .baton.json worker token.
// - BATON_TOKEN: a user-supplied bearer (handled inside createClient).
// - BATON_WORKER_TOKEN: injected by the worker daemon into every session child
//   (daemon.ts), so an agent's bare `baton` calls authenticate as the worker
//   from ANY cwd — not only the worktree root that happens to hold .baton.json.
//   Without this the agent 401s the moment it runs `baton` elsewhere (or in an
//   older session whose worktree predates the .baton.json drop).
// - .baton.json worker.apiToken: the file the worker drops into each worktree so
//   bare `baton` calls work there even when no token env is set.
// All three authenticate against an auth-enabled server (the cookie gate accepts
// a worker token as Bearer).
// Pure resolution of the auth bearer, in precedence order. 'cookie' means defer
// to createClient's BATON_USER/PASS login; undefined means no auth at all.
type AuthChoice = { bearer: string } | 'cookie' | undefined
export const resolveAuth = (env: NodeJS.ProcessEnv, fileToken: string | undefined): AuthChoice => {
  const envBearer = env.BATON_TOKEN ?? env.BATON_WORKER_TOKEN
  if (envBearer) return { bearer: envBearer }
  if (env.BATON_USER && env.BATON_PASS) return 'cookie'
  return fileToken ? { bearer: fileToken } : undefined
}

export const clientFor = (args: { url?: string }): ApiClient => {
  const baseUrl = resolveBaseUrl(args.url)
  const fileToken = loadProjectConfigOrNull(projectConfigPath())?.worker?.apiToken
  const auth = resolveAuth(process.env, fileToken)
  return createClient(baseUrl, auth && auth !== 'cookie' ? auth : undefined)
}

// Resolve `--project <id>` against the cwd `.baton.json`. Throws when neither
// flag nor config is available — callers shouldn't call this without expecting
// a project context.
export const resolveProjectId = (args: { project?: string | number }): Id => {
  if (args.project !== undefined && args.project !== '') return Number(args.project)
  const cfg = loadProjectConfigOrNull(projectConfigPath())
  if (cfg?.project !== undefined) return cfg.project
  throw new Error('no project in scope. pass --project <id> or run `baton init` in this directory.')
}

// Same shape for workspace. Used by project create/ls etc.
export const resolveWorkspaceId = (args: { workspace?: string | number }): Id => {
  if (args.workspace !== undefined && args.workspace !== '') return Number(args.workspace)
  const cfg = loadProjectConfigOrNull(projectConfigPath())
  if (cfg?.workspace !== undefined) return cfg.workspace
  throw new Error(
    'no workspace in scope. pass --workspace <id> or run `baton init` in this directory.',
  )
}

// Parse a worker handle into its global int id: "7" / "W-7" / "w-7" → 7.
// Returns null for anything else (callers fall back to a name lookup).
export const parseWorkerHandle = (handle: string): Id | null => {
  const m = handle.trim().match(/^(?:[wW]-)?(\d+)$/)
  return m ? Number(m[1]) : null
}

// Parse a comma-separated flag value into a trimmed string list (undefined when absent).
export const splitCsv = (s?: string): string[] | undefined =>
  s
    ? s
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : undefined
