import { type ApiClient, createClient } from './client.ts'
import { resolveBaseUrl } from './config.ts'

// Shared citty args carried by every command.
export const common = {
  url: {
    type: 'string' as const,
    description: 'baton server url (default BATON_URL or http://localhost:3030)',
  },
  json: { type: 'boolean' as const, description: 'output JSON' },
}

export const clientFor = (args: { url?: string }): ApiClient =>
  createClient(resolveBaseUrl(args.url))

// Parse a comma-separated flag value into a trimmed string list (undefined when absent).
export const splitCsv = (s?: string): string[] | undefined =>
  s
    ? s
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : undefined
