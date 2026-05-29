import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Id } from '@baton/shared'

// One file per (machine × project) at ${XDG_CONFIG_HOME ?? ~/.config}/baton/worker-<projectId>.json.
// v0 heartbeat is unauthed; we still cache workerId/name/machineId so
// `session new` can snapshot identity without a fresh round-trip.
export type WorkerConfig = {
  server: string
  projectId: Id
  workerId: Id
  name: string
  machineId: string
}

const configDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), '.config'), 'baton')

export const workerConfigPath = (projectId: Id): string =>
  join(configDir(), `worker-${projectId}.json`)

export const saveWorkerConfig = (path: string, config: WorkerConfig): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8')
}

export const loadWorkerConfig = (path: string): WorkerConfig =>
  JSON.parse(readFileSync(path, 'utf8')) as WorkerConfig

export const loadWorkerConfigOrNull = (path: string): WorkerConfig | null =>
  existsSync(path) ? loadWorkerConfig(path) : null
