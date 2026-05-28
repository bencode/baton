import type { WorkerClient } from '../client.ts'
import type { Backend } from './backends.ts'

// Drive one assignment to completion. Returns when the backend terminates;
// errors are caught and reported as `failed` to keep the run loop alive.
export const runAssignment = async (
  client: WorkerClient,
  assignment: { id: number },
  task: import('@baton/shared').Task,
  backend: Backend,
): Promise<'done' | 'failed'> => {
  let seq = 0
  const send = async (payload: unknown): Promise<void> => {
    await client.appendEvent(assignment.id, seq, payload)
    seq += 1
  }
  try {
    const out = await backend(task, send)
    await client.complete(assignment.id, out.status, out.result)
    return out.status
  } catch (err) {
    await client
      .complete(assignment.id, 'failed', String(err instanceof Error ? err.message : err))
      .catch(() => {})
    return 'failed'
  }
}

export type RunOptions = {
  pollIntervalMs: number
  heartbeatMs: number
  shouldContinue: () => boolean
  log?: (msg: string) => void
}

// Long-running loop: heartbeat in background, claim + run in foreground.
// Stops when shouldContinue() returns false (used for tests and SIGINT).
export const runLoop = async (
  client: WorkerClient,
  backend: Backend,
  opts: RunOptions,
): Promise<void> => {
  const log = opts.log ?? (() => {})
  const heart = setInterval(() => {
    client.heartbeat().catch(e => log(`heartbeat failed: ${e}`))
  }, opts.heartbeatMs)
  try {
    while (opts.shouldContinue()) {
      const claimed = await client.claim().catch(e => {
        log(`claim failed: ${e}`)
        return null
      })
      if (!claimed) {
        await sleep(opts.pollIntervalMs)
        continue
      }
      log(`▶ ${claimed.assignment.code}: ${claimed.task.code} ${claimed.task.title}`)
      const r = await runAssignment(client, claimed.assignment, claimed.task, backend)
      log(`${r === 'done' ? '✔' : '✗'} ${claimed.assignment.code}: ${r}`)
    }
  } finally {
    clearInterval(heart)
  }
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
