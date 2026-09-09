import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import type { AttemptResult, ClaimedExecution } from '@baton/shared'
import type { AttemptClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import type { QueryFn } from './query.ts'
import { runTurn } from './turn.ts'

const cfg: SessionConfig = {
  server: 'http://srv',
  sessionId: 1,
  name: 'x',
  agentKind: 'claude-code',
  agentSessionId: 'uuid',
  worktreePath: '/tmp/wt',
}
const execution = (): ClaimedExecution => ({
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
    payload: { text: 'first\n\nsecond', inputIds: [1, 2], planMode: false },
  },
})
const collector = () => {
  const calls: string[] = []
  const results: AttemptResult[] = []
  const worker: AttemptClient = {
    emitEvent: async type => {
      calls.push(type)
      return { ...execution().message, type }
    },
    heartbeat: async reason => {
      calls.push(reason ?? 'heartbeat')
      return { abortRequested: false, leaseUntil: Date.now() + 60_000 }
    },
    finish: async input => {
      calls.push('finish')
      results.push(input)
      return input
    },
    materialize: async () => undefined,
  }
  return { calls, results, worker }
}
const fakeQuery =
  (messages: unknown[]): QueryFn =>
  () =>
    (async function* () {
      for (const message of messages) yield message as never
    })()
const success = { type: 'result', subtype: 'success', is_error: false, result: 'ok' }
const logs: string[] = []
const log = (message: string) => {
  logs.push(message)
}

afterEach(() => {
  delete process.env.BATON_TURN_TIMEOUT_MS
  delete process.env.BATON_TURN_HEARTBEAT_MS
})

test('one merged prompt runs once, with only attempt-scoped output and one finish', async () => {
  const { calls, results, worker } = collector()
  let queries = 0
  const query: QueryFn = params => {
    queries++
    assert.equal(params.prompt, 'first\n\nsecond')
    return fakeQuery([success])(params)
  }
  assert.equal(await runTurn(cfg, worker, execution(), false, query, log), 0)
  assert.equal(queries, 1)
  assert.deepEqual(calls, ['heartbeat', 'agent_event', 'finish'])
  assert.deepEqual(results, [{ outcome: 'completed', subtype: 'success' }])
})

test('business failure finishes once without retrying', async () => {
  const { results, worker } = collector()
  assert.equal(
    await runTurn(
      cfg,
      worker,
      execution(),
      false,
      fakeQuery([
        { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' },
      ]),
      log,
    ),
    1,
  )
  assert.equal(results.length, 1)
  assert.equal(results[0]?.outcome, 'failed')
})

test('timeout aborts SDK, waits for cleanup, persists timeout and does not call finish early', async () => {
  process.env.BATON_TURN_TIMEOUT_MS = '40'
  process.env.BATON_TURN_HEARTBEAT_MS = '5'
  const { calls, worker } = collector()
  let cleaned = false
  const originalFinish = worker.finish
  worker.finish = async input => {
    assert.equal(cleaned, true)
    return originalFinish(input)
  }
  const query: QueryFn = params =>
    (async function* () {
      const signal = params.options?.abortController?.signal
      assert.ok(signal)
      await new Promise<void>(resolve =>
        signal.addEventListener('abort', () => resolve(), { once: true }),
      )
      await new Promise(resolve => setTimeout(resolve, 10))
      cleaned = true
    })()
  assert.equal(await runTurn(cfg, worker, execution(), false, query, log), 1)
  assert.ok(calls.includes('timeout'))
  assert.ok(calls.filter(call => call === 'heartbeat').length > 1)
  assert.equal(calls.at(-1), 'finish')
})

test('already interrupted or server stop request never invokes the SDK', async () => {
  const controller = new AbortController()
  controller.abort()
  let queries = 0
  const query: QueryFn = () => {
    queries++
    return fakeQuery([])({ prompt: '' })
  }
  await runTurn(
    cfg,
    collector().worker,
    execution(),
    false,
    query,
    log,
    undefined,
    undefined,
    controller.signal,
  )
  const { worker } = collector()
  worker.heartbeat = async () => ({ abortRequested: true, leaseUntil: 0 })
  await runTurn(cfg, worker, execution(), false, query, log)
  assert.equal(queries, 0)
})

test('snapshot settings, fresh/resume identity and noninteractive policy reach SDK options', async () => {
  const item = execution()
  item.message.payload = { ...item.message.payload, planMode: true, model: 'opus', effort: 'max' }
  let options: Parameters<QueryFn>[0]['options']
  const capture: QueryFn = params => {
    options = params.options
    return fakeQuery([success])(params)
  }
  await runTurn(cfg, collector().worker, item, false, capture, log)
  assert.equal(options?.permissionMode, 'plan')
  assert.equal(options?.model, 'opus')
  assert.equal(options?.effort, 'max')
  assert.equal(options?.sessionId, cfg.agentSessionId)
  assert.equal(options?.resume, undefined)
  assert.deepEqual(options?.disallowedTools, ['AskUserQuestion'])
  await runTurn(cfg, collector().worker, execution(), true, capture, log)
  assert.equal(options?.permissionMode, 'bypassPermissions')
  assert.equal(options?.model, undefined)
  assert.equal(options?.effort, undefined)
  assert.equal(options?.sessionId, undefined)
  assert.equal(options?.resume, cfg.agentSessionId)
})

test('attachments are materialized and cited before the SDK is invoked', async () => {
  const worktreePath = await mkdtemp(join(tmpdir(), 'baton-turn-'))
  const item = execution()
  item.message.payload.images = [
    `data:image/png;base64,${Buffer.from('PASTED').toString('base64')}`,
  ]
  item.message.payload.attachments = [
    {
      id: 'a',
      sessionId: 1,
      filename: 'shot.png',
      contentType: 'image/png',
      size: 7,
      url: '/sessions/1/attachments/a',
      createdAt: 0,
    },
  ]
  try {
    const query: QueryFn = params => {
      assert.match(params.prompt, /attachments\/shot\.png/)
      return fakeQuery([success])(params)
    }
    await runTurn(
      { ...cfg, worktreePath },
      collector().worker,
      item,
      false,
      query,
      log,
      undefined,
      async () => new Response('PNGDATA'),
    )
    assert.equal(await readFile(join(worktreePath, 'attachments/shot.png'), 'utf8'), 'PNGDATA')
    assert.equal(await readFile(join(worktreePath, 'attachments/pasted-1-1.png'), 'utf8'), 'PASTED')
  } finally {
    await rm(worktreePath, { recursive: true, force: true })
  }
})
