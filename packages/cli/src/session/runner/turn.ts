import type { ChildProcess } from 'node:child_process'
import type { SessionEvent } from '@baton/shared'
import type { WorkerClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import type { TailBuffer } from './log.ts'
import { type SpawnImpl, spawnClaude } from './spawn.ts'
import { streamSdkEvents } from './stream.ts'

// Wait for exit, then emit turn_error (if non-zero) + turn_complete. Returns
// the child exit code so the caller can decide if this turn was good enough
// to switch the next one to --resume.
const finalizeTurn = async (
  child: ChildProcess,
  tail: TailBuffer,
  worker: WorkerClient,
  log: (m: string) => void,
): Promise<number> => {
  const exitCode = await new Promise<number>(resolve =>
    child.once('exit', code => resolve(code ?? -1)),
  )
  log(`[exit] code=${exitCode}`)
  const stderrTail = tail.toString()
  if (exitCode !== 0) {
    await worker.emitEvent('turn_error', {
      message: `claude exited with code ${exitCode}`,
      exitCode,
      stderrTail,
    })
  }
  await worker.emitEvent('turn_complete', {
    exitCode,
    ...(stderrTail ? { stderrTail } : {}),
  })
  return exitCode
}

// Run exactly one turn end-to-end. POSTs turn_start, spawns claude, forwards
// each stream-json line as sdk_event, finishes with turn_complete on exit.
// Non-zero exit also emits a turn_error with stderr tail. Spawn/IO failures
// become turn_error and return -1.
export const runTurn = async (
  config: SessionConfig,
  worker: WorkerClient,
  msg: SessionEvent,
  resuming: boolean,
  spawnImpl: SpawnImpl,
  log: (m: string) => void = m => console.log(m),
  envOverlay?: Record<string, string>,
): Promise<number> => {
  await worker.emitEvent('turn_start', { messageId: msg.id })
  const text = (msg.payload as { text?: unknown })?.text
  if (typeof text !== 'string' || text.length === 0) {
    await worker.emitEvent('turn_error', { message: 'user_message missing text' })
    return -1
  }
  const result = await spawnClaude(config, worker, text, resuming, spawnImpl, log, envOverlay)
  if (!result) return -1
  try {
    // Non-null asserted: spawnClaude already checked child.stdout.
    await streamSdkEvents(result.child.stdout as NonNullable<typeof result.child.stdout>, worker)
    return await finalizeTurn(result.child, result.tail, worker, log)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[run] ${message}`)
    await worker.emitEvent('turn_error', { message, stderrTail: result.tail.toString() })
    return -1
  }
}
