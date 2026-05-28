import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Code, Id, SessionMode } from '@baton/shared'

// Persisted worker identity: enough to reconnect to the server as the same Session.
// One file per registered session; default location ~/.config/baton/worker-<S-N>.json
// (override XDG_CONFIG_HOME for the standard XDG lookup, or pass --config <path>).
export type WorkerConfig = {
  server: string
  apiToken: string
  sessionId: Id
  sessionCode: Code
  projectId: Id
  name: string
  mode: SessionMode
  capabilities: string[]
}

const configDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), '.config'), 'baton')

export const defaultConfigPath = (sessionCode: Code): string =>
  join(configDir(), `worker-${sessionCode}.json`)

export const saveConfig = (path: string, config: WorkerConfig): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8')
}

export const loadConfig = (path: string): WorkerConfig =>
  JSON.parse(readFileSync(path, 'utf8')) as WorkerConfig
