import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ClaimedExecution } from '@baton/shared'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import type { QueryFn } from './runner/query.ts'
import {
  type EventSourceLike,
  isAgentConversationResumable,
  runDaemon,
  shouldReap,
} from './runner.ts'

describe('isAgentConversationResumable', () => {
  const claude: SessionConfig = {
    server: 'http://srv',
    sessionId: 1,
    name: 'claude',
    agentKind: 'claude-code',
    agentSessionId: '00000000-0000-4000-8000-000000000001',
    worktreePath: '/tmp/wt',
  }

  test('claude resumes only after its transcript exists', () => {
    assert.equal(
      isAgentConversationResumable(claude, () => null),
      false,
    )
    assert.equal(
      isAgentConversationResumable(claude, () => '/tmp/session.jsonl'),
      true,
    )
  })

  test('codex resumes only after its pending id becomes a real thread id', () => {
    let transcriptLookupCalled = false
    const lookup = (): string | null => {
      transcriptLookupCalled = true
      return '/unused'
    }
    assert.equal(
      isAgentConversationResumable(
        { ...claude, agentKind: 'codex', agentSessionId: 'pending:fresh' },
        lookup,
      ),
      false,
    )
    assert.equal(
      isAgentConversationResumable(
        { ...claude, agentKind: 'codex', agentSessionId: 'real-codex-thread' },
        lookup,
      ),
      true,
    )
    assert.equal(transcriptLookupCalled, false)
  })
})

const cfg: SessionConfig = {
  server: 'http://srv',
  sessionId: 1,
  name: 'x',
  agentKind: 'claude-code',
  agentSessionId: 'uuid',
  worktreePath: '/tmp/wt',
}
const claimed = (): ClaimedExecution => ({
  kind: 'execute',
  config: cfg,
  turn: {
    id: 1,
    sessionId: 1,
    userEventSequence: 0,
    status: 'running',
    createdAt: 0,
    finishedAt: null,
  },
  attempt: {
    id: 1,
    turnId: 1,
    number: 1,
    claimId: 'c',
    runnerToken: 'r',
    status: 'running',
    leaseUntil: Date.now() + 60_000,
    stopReason: null,
    stopRequestedAt: null,
    startedAt: 0,
    finishedAt: null,
    result: null,
  },
  message: {
    id: 1,
    sessionId: 1,
    sequence: 0,
    type: 'user_message',
    createdAt: 0,
    payload: { text: 'A\n\nB', planMode: false, inputIds: [1, 2] },
  },
})
const streamStub = () => {
  let instance: EventSourceLike | undefined
  class Stream implements EventSourceLike {
    onopen: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    constructor() {
      instance = this
    }
    close() {}
  }
  return {
    Stream,
    open: () => instance?.onopen?.(),
    emit: (payload: unknown) => instance?.onmessage?.({ data: JSON.stringify(payload) }),
  }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('claim transport retry keeps claimId; the returned batch invokes SDK once', async () => {
  const controller = new AbortController()
  const stream = streamStub()
  const claims: string[] = []
  let queries = 0
  const worker: WorkerClient = {
    setActive: async () => undefined,
    claim: async input => {
      claims.push(input.claimId)
      if (claims.length === 1) throw new Error('lost claim response')
      return claimed()
    },
    state: async () => ({
      paused: false,
      contextResetRequested: false,
      pendingCount: 0,
      turn: null,
      attempt: null,
    }),
    stopped: async () => ({ outcome: 'aborted' }),
    forAttempt: () => ({
      heartbeat: async () => ({ abortRequested: false, leaseUntil: Date.now() + 60_000 }),
      emitEvent: async type => ({ ...claimed().message, type }),
      finish: async input => {
        controller.abort()
        return input
      },
      materialize: async () => undefined,
    }),
  }
  const query: QueryFn = params =>
    (async function* () {
      queries++
      assert.equal(params.prompt, 'A\n\nB')
      yield { type: 'result', subtype: 'success', is_error: false } as never
    })()
  const running = runDaemon(
    { ...cfg },
    { worker, runnerToken: 'r', queryFn: query, eventSourceImpl: stream.Stream, log: () => {} },
    controller.signal,
  )
  stream.open()
  await tick()
  stream.open()
  await running
  assert.equal(queries, 1)
  assert.equal(claims.length, 2)
  assert.equal(claims[0], claims[1])
})

test('late interrupt from an old attempt does not stop the current attempt; matching interrupt does', async () => {
  const controller = new AbortController()
  const stream = streamStub()
  let signal: AbortSignal | undefined
  let entered: () => void = () => {}
  const querying = new Promise<void>(resolve => {
    entered = resolve
  })
  const worker: WorkerClient = {
    setActive: async () => undefined,
    claim: async () => claimed(),
    state: async () => ({
      paused: false,
      contextResetRequested: false,
      pendingCount: 0,
      turn: null,
      attempt: null,
    }),
    stopped: async () => ({ outcome: 'aborted' }),
    forAttempt: () => ({
      heartbeat: async () => ({ abortRequested: false, leaseUntil: Date.now() + 60_000 }),
      emitEvent: async type => ({ ...claimed().message, type }),
      finish: async input => {
        assert.equal(input.outcome, 'aborted')
        controller.abort()
        return input
      },
      materialize: async () => undefined,
    }),
  }
  const query: QueryFn = params =>
    (async function* () {
      signal = params.options?.abortController?.signal
      entered()
      await new Promise<void>(resolve =>
        signal?.addEventListener('abort', () => resolve(), { once: true }),
      )
    })()
  const running = runDaemon(
    { ...cfg },
    { worker, runnerToken: 'r', queryFn: query, eventSourceImpl: stream.Stream, log: () => {} },
    controller.signal,
  )
  stream.open()
  await querying
  stream.emit({ type: 'system', payload: { action: 'interrupt', attemptId: 999 } })
  assert.equal(signal?.aborted, false)
  stream.emit({ type: 'system', payload: { action: 'interrupt', attemptId: 1 } })
  await running
  assert.equal(signal?.aborted, true)
})

test('uncertain finish strands the execution and never invokes SDK again on reconnect', async () => {
  const controller = new AbortController()
  const stream = streamStub()
  let queries = 0
  let failed: () => void = () => {}
  const stranded = new Promise<void>(resolve => {
    failed = resolve
  })
  const worker: WorkerClient = {
    setActive: async () => undefined,
    claim: async () => claimed(),
    state: async () => ({
      paused: false,
      contextResetRequested: false,
      pendingCount: 0,
      turn: null,
      attempt: null,
    }),
    stopped: async () => ({ outcome: 'aborted' }),
    forAttempt: () => ({
      heartbeat: async () => ({ abortRequested: false, leaseUntil: Date.now() + 60_000 }),
      emitEvent: async type => ({ ...claimed().message, type }),
      finish: async () => {
        throw new Error('finish response lost')
      },
      materialize: async () => undefined,
    }),
  }
  const query: QueryFn = () =>
    (async function* () {
      queries++
      yield { type: 'result', subtype: 'success', is_error: false } as never
    })()
  const running = runDaemon(
    { ...cfg },
    {
      worker,
      runnerToken: 'r',
      queryFn: query,
      eventSourceImpl: stream.Stream,
      log: message => {
        if (message.startsWith('[execution]')) failed()
      },
    },
    controller.signal,
  )
  stream.open()
  await stranded
  stream.open()
  await tick()
  controller.abort()
  await running
  assert.equal(queries, 1)
})

describe('shouldReap', () => {
  const idle = 1000
  const now = 10_000
  test('reaps only when idle long enough, not busy, and queue empty', () => {
    assert.equal(shouldReap(now - idle, now, false, 0, idle), true) // idle → reap
    assert.equal(shouldReap(now - idle, now, true, 0, idle), false) // mid-turn → keep
    assert.equal(shouldReap(now - idle, now, false, 2, idle), false) // queued work → keep
    assert.equal(shouldReap(now - 1, now, false, 0, idle), false) // recent activity → keep
  })
})
