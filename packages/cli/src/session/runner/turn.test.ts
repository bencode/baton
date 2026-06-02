import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { afterEach, describe, test } from 'node:test'
import type { WorkerClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import { runTurn } from './turn.ts'

const cfg: SessionConfig = {
  server: 's',
  sessionId: 1,
  name: 'x',
  agentSessionId: 'uuid',
  worktreePath: '/tmp/wt',
}

const collector = (): { calls: string[]; worker: WorkerClient } => {
  const calls: string[] = []
  const worker = {
    close: async () => {},
    emitEvent: async (type: string) => {
      calls.push(type)
      return {} as never
    },
  } as unknown as WorkerClient
  return { calls, worker }
}

const userMsg = (): Parameters<typeof runTurn>[2] => ({
  id: 1,
  sessionId: 1,
  sequence: 0,
  type: 'user_message',
  payload: { text: 'hi' },
  createdAt: 0,
})

type FakeChild = EventEmitter & {
  stdout: Readable
  exitCode?: number | null
  signalCode?: string | null
  kill?: (sig?: string) => boolean
}

afterEach(() => {
  delete process.env.BATON_TURN_TIMEOUT_MS
})

describe('runTurn — exit race', () => {
  // The production wedge: claude exits *before* the runner finishes draining
  // stdout, so the exit event is already gone by the time we'd listen for it.
  // We model that by setting exitCode and never emitting 'exit'. Pre-fix this
  // hangs forever (no turn_complete); the fix reads exitCode and finalizes.
  test('child already exited (no exit event) still completes', async () => {
    const { calls, worker } = collector()
    const spawnImpl = (() => {
      const child = new EventEmitter() as FakeChild
      child.stdout = Readable.from([`${JSON.stringify({ type: 'result' })}\n`])
      child.exitCode = 0 // already reaped, like a real finished ChildProcess
      return child as unknown as never
    }) as unknown as never

    const code = await runTurn(cfg, worker, userMsg(), false, spawnImpl, () => {})
    assert.equal(code, 0)
    assert.deepEqual(calls, ['turn_start', 'sdk_event', 'turn_complete'])
  })

  // A turn that never produces output and never exits must not hang the session
  // forever — the watchdog kills it and we finalize with an error.
  test('watchdog kills a turn that overruns the ceiling', async () => {
    process.env.BATON_TURN_TIMEOUT_MS = '40'
    const { calls, worker } = collector()
    const spawnImpl = (() => {
      const child = new EventEmitter() as FakeChild
      child.stdout = new Readable({ read() {} }) // never ends on its own
      child.kill = (sig?: string) => {
        child.stdout.push(null) // SIGKILL closes claude's stdout → EOF
        setImmediate(() => child.emit('exit', null, sig))
        return true
      }
      return child as unknown as never
    }) as unknown as never

    const code = await runTurn(cfg, worker, userMsg(), false, spawnImpl, () => {})
    assert.equal(code, -1)
    // turn_error for the timeout, then a second turn_error for the non-zero exit,
    // then turn_complete — the turn always terminates rather than wedging.
    assert.ok(calls.includes('turn_complete'))
    assert.ok(calls.filter(c => c === 'turn_error').length >= 1)
  })
})
