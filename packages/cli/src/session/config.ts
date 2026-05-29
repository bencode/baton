import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Id, SessionMode } from '@baton/shared'

// Persisted session identity: enough to reconnect / dogfood. One file per
// registered session at ${XDG_CONFIG_HOME ?? ~/.config}/baton/session-<id>.json
// (the int id assigned by baton — no `code` / S-N anymore).
// Runtime knobs (proxy, tokens, …) intentionally live on `session run` flags
// or the shell env — not here — because they change independently of identity.
export type SessionConfig = {
  server: string
  apiToken: string
  sessionId: Id
  projectId: Id
  name: string
  mode: SessionMode
  claudeSessionId: string
  worktreePath: string
  // M2.6: machineId carried in the session config so the daemon can heartbeat
  // /workers/heartbeat without re-reading the machine-id file each tick.
  // Optional because legacy session configs (pre-M2.6) don't have it.
  machineId?: string
  workerName?: string
}

const configDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), '.config'), 'baton')

export const defaultConfigPath = (sessionId: Id): string =>
  join(configDir(), `session-${sessionId}.json`)

export const saveConfig = (path: string, config: SessionConfig): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8')
}

export const loadConfig = (path: string): SessionConfig =>
  JSON.parse(readFileSync(path, 'utf8')) as SessionConfig
