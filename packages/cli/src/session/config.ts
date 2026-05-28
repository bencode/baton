import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Code, Id, SessionMode } from '@baton/shared'

// Persisted session identity: enough to reconnect / dogfood. One file per
// registered session at ${XDG_CONFIG_HOME ?? ~/.config}/baton/session-<S-N>.json.
//
// `env` is an optional bag of vars the daemon injects into the spawned
// `claude` subprocess. Typical use: ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN
// for Anthropic-compatible proxy services (mirror, gateway, etc).
export type SessionConfig = {
  server: string
  apiToken: string
  sessionId: Id
  sessionCode: Code
  projectId: Id
  name: string
  mode: SessionMode
  claudeSessionId: string
  worktreePath: string
  env?: Record<string, string>
}

const configDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), '.config'), 'baton')

export const defaultConfigPath = (sessionCode: Code): string =>
  join(configDir(), `session-${sessionCode}.json`)

export const saveConfig = (path: string, config: SessionConfig): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8')
}

export const loadConfig = (path: string): SessionConfig =>
  JSON.parse(readFileSync(path, 'utf8')) as SessionConfig
