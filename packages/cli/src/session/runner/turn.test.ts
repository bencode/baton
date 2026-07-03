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
  agentKind: 'claude-code',
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
  delete process.env.BATON_TURN_HEARTBEAT_MS
})

describe('runTurn', () => {
  // A successful turn forwards the result as an agent_event and finalizes with a
  // single turn_complete — no turn_error.
  test('success result completes cleanly', async () => {
    const { calls, worker } = collector()
    const qf = fakeQuery([{ type: 'result', subtype: 'success', is_error: false, result: 'ok' }])
    const code = await runTurn(cfg, worker, userMsg(), false, qf, () => {})
    assert.equal(code, 0)
    assert.deepEqual(calls, ['turn_start', 'agent_event', 'turn_complete'])
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

  // An external abort signal (web /abort, like Esc) interrupts the in-flight
  // turn and finalizes cleanly instead of waiting it out.
  test('external abort signal interrupts the turn', async () => {
    const { calls, worker } = collector()
    const ac = new AbortController()
    ac.abort()
    const code = await runTurn(
      cfg,
      worker,
      userMsg(),
      false,
      hangingQuery,
      () => {},
      undefined,
      undefined,
      ac.signal,
    )
    assert.equal(code, -1)
    assert.ok(calls.includes('turn_error'))
    assert.ok(calls.includes('turn_complete'))
  })

  // A long single tool call streams no agent_events, so the turn pings the server
  // with turn_heartbeat to stay above the liveness TTL. Here a wedged query runs
  // until the watchdog aborts it; the heartbeat must have fired meanwhile.
  test('emits turn_heartbeat while a turn runs', async () => {
    process.env.BATON_TURN_HEARTBEAT_MS = '5'
    process.env.BATON_TURN_TIMEOUT_MS = '60'
    const { calls, worker } = collector()
    const code = await runTurn(cfg, worker, userMsg(), false, hangingQuery, () => {})
    assert.equal(code, -1) // watchdog aborts the hang
    assert.equal(calls[0], 'turn_start')
    assert.ok(calls.includes('turn_heartbeat'), 'should ping at least once')
    assert.ok(calls.includes('turn_complete'))
  })

  // The web /plan command sets payload.planMode → the SDK runs read-only
  // (permissionMode:'plan'); a normal message stays bypassPermissions.
  test('planMode message → permissionMode plan; normal → bypassPermissions', async () => {
    const seen: { mode?: unknown } = {}
    const capture: QueryFn = params => {
      seen.mode = (params.options as { permissionMode?: unknown } | undefined)?.permissionMode
      return (async function* () {
        yield { type: 'result', subtype: 'success', is_error: false, result: 'ok' } as never
      })()
    }
    const planMsg = { ...userMsg(), payload: { text: 'hi', planMode: true } }
    await runTurn(cfg, collector().worker, planMsg, false, capture, () => {})
    assert.equal(seen.mode, 'plan')
    await runTurn(cfg, collector().worker, userMsg(), false, capture, () => {})
    assert.equal(seen.mode, 'bypassPermissions')
  })

  // Headless relay can't answer interactive asks, so AskUserQuestion is blocked
  // (Issue #9 Track A): the SDK options must always disallow it.
  test('AskUserQuestion is disallowed in SDK options', async () => {
    const seen: { disallowed?: unknown } = {}
    const capture: QueryFn = params => {
      seen.disallowed = (
        params.options as { disallowedTools?: unknown } | undefined
      )?.disallowedTools
      return (async function* () {
        yield { type: 'result', subtype: 'success', is_error: false, result: 'ok' } as never
      })()
    }
    await runTurn(cfg, collector().worker, userMsg(), false, capture, () => {})
    assert.deepEqual(seen.disallowed, ['AskUserQuestion'])
  })
})
