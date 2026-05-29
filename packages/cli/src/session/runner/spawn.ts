import type { ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { WorkerClient } from '../../client.ts'
import type { SessionConfig } from '../config.ts'
import { buildClaudeArgs, claudeBin, maskedEnvKeys, previewText, type TailBuffer, tailBuffer } from './log.ts'

export type SpawnImpl = (
  command: string,
  args: ReadonlyArray<string>,
  options: Parameters<typeof spawn>[2],
) => ChildProcess

export type SpawnResult = { child: ChildProcess; tail: TailBuffer }

// Spawn claude for one turn, pipe stderr → log + 2KB tail. Returns null
// (and emits turn_error) when spawn fails or claude has no stdout.
export const spawnClaude = async (
  config: SessionConfig,
  worker: WorkerClient,
  text: string,
  resuming: boolean,
  spawnImpl: SpawnImpl,
  log: (m: string) => void,
  envOverlay?: Record<string, string>,
): Promise<SpawnResult | null> => {
  const childEnv: NodeJS.ProcessEnv = envOverlay ? { ...process.env, ...envOverlay } : process.env
  const bin = claudeBin()
  const args = buildClaudeArgs(config.claudeSessionId, text, resuming)
  log(`[spawn] ${bin} ${args.slice(0, -1).join(' ')} -- "${previewText(text)}"`)
  log(`[spawn] cwd: ${config.worktreePath}`)
  log(`[spawn] runtime env keys: ${maskedEnvKeys(envOverlay)}`)

  let child: ChildProcess
  try {
    child = spawnImpl(bin, args, {
      cwd: config.worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[spawn] failed: ${message}`)
    await worker.emitEvent('turn_error', { message: `spawn failed: ${message}` })
    return null
  }
  if (!child.stdout) {
    log('[spawn] no stdout from claude — aborting turn')
    await worker.emitEvent('turn_error', { message: 'no stdout from claude' })
    return null
  }
  const tail = tailBuffer()
  if (child.stderr) {
    const errLines = createInterface({ input: child.stderr })
    void (async () => {
      for await (const line of errLines) {
        tail.append(`${line}\n`)
        log(`[claude] ${line}`)
      }
    })()
  }
  return { child, tail }
}
