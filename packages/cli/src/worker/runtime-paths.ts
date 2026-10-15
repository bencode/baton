import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Id } from '@baton/shared'
import type { WorkerConfig } from '../project-config.ts'

type Owner = Pick<WorkerConfig, 'server' | 'workerId'>

export const workerRuntimeDir = (owner: Owner, env: NodeJS.ProcessEnv = process.env): string =>
  join(
    env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local/share'),
    'baton',
    'runtime',
    createHash('sha256').update(owner.server).digest('hex'),
    `worker-${owner.workerId}`,
  )

export const sessionRuntimeDir = (
  owner: Owner,
  sessionId: Id,
  env: NodeJS.ProcessEnv = process.env,
): string => join(workerRuntimeDir(owner, env), 'sessions', String(sessionId))
