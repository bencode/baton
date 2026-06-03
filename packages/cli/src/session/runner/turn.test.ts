import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import type { WorkerClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import type { QueryFn } from './query.ts'
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

// Fake query: yields the given SDK messages then completes.
const fakeQuery =
  (messages: unknown[]): QueryFn =>
  () =>
    (async function* () {
      for (const m of messages) yield m as never
    })()

// Fake query that never yields and never ends — models a wedged claude.
const hangingQuery: QueryFn = () =>
  (async function* () {
    await new Promise(() => {})
  })()

afterEach(() => {
  delete process.env.BATON_TURN_TIMEOUT_MS
})

describe('runTurn', () => {
  // A successful turn forwards the result as an sdk_event and finalizes with a
  // single turn_complete — no turn_error.
  test('success result completes cleanly', async () => {
    const { calls, worker } = collector()
    const qf = fakeQuery([{ type: 'result', subtype: 'success', is_error: false, result: 'ok' }])
    const code = await runTurn(cfg, worker, userMsg(), false, qf, () => {})
    assert.equal(code, 0)
    assert.deepEqual(calls, ['turn_start', 'sdk_event', 'turn_complete'])
  })

  // An error result (non-success subtype / is_error) emits turn_error then
  // turn_complete and reports a non-zero code.
  test('error result emits turn_error', async () => {
    const { calls, worker } = collector()
    const qf = fakeQuery([
      { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' },
    ])
    const code = await runTurn(cfg, worker, userMsg(), false, qf, () => {})
    assert.notEqual(code, 0)
    assert.ok(calls.includes('turn_error'))
    assert.ok(calls.includes('turn_complete'))
  })

  // A turn that never produces a result and never ends must not hang the session
  // forever — the watchdog aborts it and we finalize with an error.
  test('watchdog aborts a turn that overruns the ceiling', async () => {
    process.env.BATON_TURN_TIMEOUT_MS = '40'
    const { calls, worker } = collector()
    const code = await runTurn(cfg, worker, userMsg(), false, hangingQuery, () => {})
    assert.equal(code, -1)
    assert.ok(calls.includes('turn_complete'))
    assert.ok(calls.filter(c => c === 'turn_error').length >= 1)
  })
})
