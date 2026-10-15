import type { Id } from '@baton/shared'
import { type ApiClient, createClient } from './client.ts'
import { resolveBaseUrl } from './config.ts'
import { loadProjectConfigOrNull, projectConfigPath } from './project-config.ts'

// Shared citty args carried by every command.
export const common = {
  url: {
    type: 'string' as const,
    description:
      'baton server url (--url > BATON_SERVER > .baton.json > BATON_URL > http://localhost:3280)',
  },
  json: { type: 'boolean' as const, description: 'output JSON' },
}

// Explicit auth environment takes precedence over the project Worker token.
// Worker children inherit BATON_WORKER_TOKEN, including from outside the project root.
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

// The resolved Bearer token for baton-authed calls (or undefined). Same precedence
// as clientFor, exposed for callers that drive a non-ApiClient client — e.g. channel
// create, which now POSTs to the workspace-scoped (membership-gated) endpoint.
export const resolveBearer = (): string | undefined => {
  const fileToken = loadProjectConfigOrNull(projectConfigPath())?.worker?.apiToken
  const auth = resolveAuth(process.env, fileToken)
  return auth && auth !== 'cookie' ? auth.bearer : undefined
}

// Resolve `--project <id>` against the cwd `.baton.json`. Throws when neither
// flag nor config is available — callers shouldn't call this without expecting
// a project context.
export const resolveProjectId = (args: { project?: string | number }): Id => {
  if (args.project !== undefined && args.project !== '') return Number(args.project)
  if (process.env.BATON_PROJECT_ID !== undefined)
    return contextId(process.env.BATON_PROJECT_ID, 'BATON_PROJECT_ID')
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

// Parse a loop interval into seconds: "90s" / "30m" / "2h" / "1d", or a bare
// number (= seconds). Throws on anything else so a typo fails loudly.
export const parseDuration = (s: string): number => {
  const m = s.trim().match(/^(\d+)\s*([smhd]?)$/)
  if (!m) throw new Error(`bad interval "${s}" — use e.g. 90s, 30m, 2h, 1d`)
  const n = Number(m[1])
  const mult = m[2] === 'd' ? 86400 : m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1
  return n * mult
}

const contextId = (value: string, source: string): Id => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`invalid ${source}`)
  return id
}

export const resolveWorkerId = (): Id => {
  if (process.env.BATON_WORKER_ID !== undefined)
    return contextId(process.env.BATON_WORKER_ID, 'BATON_WORKER_ID')
  const id = loadProjectConfigOrNull(projectConfigPath())?.worker?.id
  if (id === undefined) throw new Error('no worker in scope')
  return id
}
