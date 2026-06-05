import type { ExternalRef, Id } from '@baton/shared'
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

export const clientFor = (args: { url?: string }): ApiClient =>
  createClient(resolveBaseUrl(args.url))

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

// Parse a GitHub issue URL into the light ExternalRef association. Accepts
// https://github.com/<owner>/<repo>/issues/<n> (trailing query/fragment tolerated).
export const parseIssueUrl = (url: string): ExternalRef => {
  const m = url.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/)
  if (!m)
    throw new Error(`expected a GitHub issue url (https://github.com/o/r/issues/N), got "${url}"`)
  return { source: 'github', number: Number(m[1]), url: url.split(/[?#]/)[0] }
}

// Parse a comma-separated flag value into a trimmed string list (undefined when absent).
export const splitCsv = (s?: string): string[] | undefined =>
  s
    ? s
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : undefined
