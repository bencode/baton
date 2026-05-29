import type { Id } from '@baton/shared'
import { type ApiClient, createClient } from './client.ts'
import { resolveBaseUrl } from './config.ts'
import { findProjectConfig } from './project-config.ts'

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
  const found = findProjectConfig()
  if (found?.config.project !== undefined) return found.config.project
  throw new Error(
    'no project in scope. pass --project <id> or run `baton init` in this directory.',
  )
}

// Same shape for workspace. Used by project create/ls etc.
export const resolveWorkspaceId = (args: { workspace?: string | number }): Id => {
  if (args.workspace !== undefined && args.workspace !== '') return Number(args.workspace)
  const found = findProjectConfig()
  if (found?.config.workspace !== undefined) return found.config.workspace
  throw new Error(
    'no workspace in scope. pass --workspace <id> or run `baton init` in this directory.',
  )
}

// Parse a comma-separated flag value into a trimmed string list (undefined when absent).
export const splitCsv = (s?: string): string[] | undefined =>
  s
    ? s
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : undefined
