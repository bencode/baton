import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { SessionEvent } from '@baton/shared'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import type { QueryFn } from './runner/query.ts'
import { type EventSourceLike, runDaemon, runTurn, shouldReap } from './runner.ts'

// Build a fake query that records the params it was called with and yields the
// given SDK messages. `seen` lets a test inspect prompt + options afterwards.
const recordingQuery = (
  messages: unknown[],
): { qf: QueryFn; seen: { prompt?: string; options?: Record<string, unknown> } } => {
  const seen: { prompt?: string; options?: Record<string, unknown> } = {}
  const qf: QueryFn = params => {
    seen.prompt = params.prompt
    seen.options = params.options as Record<string, unknown>
    return (async function* () {
      for (const m of messages) yield m as never
    })()
  }
  return { qf, seen }
}

describe('runTurn', () => {
  test('posts turn_start + N sdk_event + turn_complete; presets sessionId vs resume', async () => {
    const cfg: SessionConfig = {
      server: 'http://localhost:3280',
      sessionId: 1,
      name: 'dogfood',
      agentSessionId: '00000000-0000-0000-0000-000000000001',
      worktreePath: '/tmp/wt',
    }
    const calls: Array<{ type: string; payload: unknown }> = []
    const worker = {
      close: async () => {},
      emitEvent: async (type: string, payload: unknown) => {
        calls.push({ type, payload })
        return {} as never
      },
    } as unknown as WorkerClient

    const { qf, seen } = recordingQuery([
      { type: 'assistant', message: { content: 'hi' } },
      { type: 'tool_use', name: 'Read' },
      { type: 'result', subtype: 'success', is_error: false },
    ])

    // first turn → sessionId preset (= CLI --session-id)
    const code1 = await runTurn(
      cfg,
      worker,
      {
        id: 99,
        sessionId: 1,
        sequence: 0,
        type: 'user_message',
        payload: { text: 'hi' },
        createdAt: 0,
      },
      false,
      qf,
    )
    assert.equal(seen.options?.sessionId, cfg.agentSessionId)
    assert.equal(seen.options?.resume, undefined)
    assert.equal(seen.options?.cwd, cfg.worktreePath)
    assert.deepEqual(
      calls.map(c => c.type),
      ['turn_start', 'sdk_event', 'sdk_event', 'sdk_event', 'turn_complete'],
    )
    assert.deepEqual(calls[0]?.payload, { messageId: 99 })
    assert.deepEqual(calls[4]?.payload, { subtype: 'success' })
    assert.equal(code1, 0)

    // second turn → resume (= CLI --resume)
    calls.length = 0
    await runTurn(
      cfg,
      worker,
      {
        id: 100,
        sessionId: 1,
        sequence: 5,
        type: 'user_message',
        payload: { text: 'again' },
        createdAt: 0,
      },
      true,
      qf,
    )
    assert.equal(seen.options?.resume, cfg.agentSessionId)
    assert.equal(seen.options?.sessionId, undefined)
  })

  test('empty text → turn_error, no query', async () => {
    const cfg: SessionConfig = {
      server: 's',
      sessionId: 1,
      name: 'x',
      agentSessionId: 'uuid',
      worktreePath: '/tmp/wt',
    }
    const calls: Array<{ type: string }> = []
    const worker = {
      close: async () => {},
      emitEvent: async (type: string) => {
        calls.push({ type })
        return {} as never
      },
    } as unknown as WorkerClient
    let called = false
    const qf: QueryFn = () => {
      called = true
      throw new Error('should not be called')
    }
    await runTurn(
      cfg,
      worker,
      { id: 1, sessionId: 1, sequence: 0, type: 'user_message', payload: {}, createdAt: 0 },
      false,
      qf,
    )
    assert.equal(called, false)
    assert.deepEqual(
      calls.map(c => c.type),
      ['turn_start', 'turn_error'],
    )
  })

  test('attachments are downloaded into the worktree and cited in the prompt', async () => {
    const wt = mkdtempSync(join(tmpdir(), 'baton-turn-'))
    const cfg: SessionConfig = {
      server: 'http://srv',
      sessionId: 1,
      name: 'x',
      agentSessionId: 'uuid',
      worktreePath: wt,
    }
    const worker = {
      close: async () => {},
      emitEvent: async () => ({}) as never,
    } as unknown as WorkerClient
    const fetchImpl = (async () => new Response('PNGDATA')) as unknown as typeof fetch

    const { qf, seen } = recordingQuery([{ type: 'result', subtype: 'success', is_error: false }])

    try {
      const code = await runTurn(
        cfg,
        worker,
        {
          id: 1,
          sessionId: 1,
          sequence: 0,
          type: 'user_message',
          payload: {
            text: 'describe',
            attachments: [
              {
                id: 'a',
                sessionId: 1,
                filename: 'shot.png',
                contentType: 'image/png',
                size: 7,
                url: '/sessions/1/attachments/a',
                createdAt: 0,
              },
            ],
          },
          createdAt: 0,
        },
        false,
        qf,
        () => {},
        undefined,
        fetchImpl,
      )
      assert.equal(code, 0)
      assert.match(seen.prompt ?? '', /attachments\/shot\.png/)
      assert.ok((seen.prompt ?? '').includes('describe'))
      assert.equal(readFileSync(join(wt, 'attachments/shot.png'), 'utf8'), 'PNGDATA')
    } finally {
      rmSync(wt, { recursive: true, force: true })
    }
  })
})

// EventSource stub that fires onopen on the next tick (after runDaemon assigns
// the handler), driving the reconcile-on-connect path without a real stream.
const openOnConnect = (): (new (u: string) => EventSourceLike) => {
  class FakeES {
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onopen: (() => void) | null = null
    closed = false
    constructor(public url: string) {
      setTimeout(() => this.onopen?.(), 0)
    }
    close(): void {
      this.closed = true
    }
  }
  return FakeES as unknown as new (
    u: string,
  ) => EventSourceLike
}

// Like openOnConnect, but also exposes `emit` to push a live SSE event after the
// daemon has subscribed — drives the interrupt path. `opened` resolves on onopen.
const controllableES = (): {
  ctor: new (u: string) => EventSourceLike
  emit: (data: unknown) => void
  opened: Promise<void>
} => {
  let inst: { onmessage: ((e: { data: string }) => void) | null } | null = null
  let resolveOpened = (): void => {}
  const opened = new Promise<void>(r => {
    resolveOpened = r
  })
  class FakeES {
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onopen: (() => void) | null = null
    constructor(public url: string) {
      inst = this
      setTimeout(() => {
        this.onopen?.()
        resolveOpened()
      }, 0)
    }
    close(): void {}
  }
  return {
    ctor: FakeES as unknown as new (u: string) => EventSourceLike,
    emit: (data: unknown) => inst?.onmessage?.({ data: JSON.stringify(data) }),
    opened,
  }
}

describe('runDaemon reconcile-on-connect', () => {
  const cfg: SessionConfig = {
    server: 'http://srv',
    sessionId: 1,
    name: 'x',
    agentSessionId: 'uuid-without-transcript',
    worktreePath: '/tmp/wt',
  }

  test('drains an unstarted user_message from the transcript and runs its turn', async () => {
    const controller = new AbortController()
    const calls: Array<{ type: string; payload: unknown }> = []
    // A stranded message: persisted, but no turn_start ever ran (the bug case).
    const events: SessionEvent[] = [
      {
        id: 7,
        sessionId: 1,
        sequence: 0,
        type: 'user_message',
        payload: { text: 'stranded' },
        createdAt: 0,
      },
    ]
    const worker = {
      setActive: async () => ({}),
      listEvents: async () => events,
      emitEvent: async (type: string, payload: unknown) => {
        calls.push({ type, payload })
        if (type === 'turn_complete') controller.abort() // exit once the turn lands
        return {} as never
      },
    } as unknown as WorkerClient
    const { qf } = recordingQuery([{ type: 'result', subtype: 'success', is_error: false }])

    await runDaemon(
      cfg,
      { worker, queryFn: qf, eventSourceImpl: openOnConnect(), log: () => {} },
      controller.signal,
    )

    assert.deepEqual(
      calls.map(c => c.type),
      ['turn_start', 'sdk_event', 'turn_complete'],
    )
    assert.deepEqual(calls[0]?.payload, { messageId: 7 })
  })

  test('does not re-run a user_message that already has a turn_start', async () => {
    const controller = new AbortController()
    const calls: Array<{ type: string }> = []
    const events: SessionEvent[] = [
      {
        id: 7,
        sessionId: 1,
        sequence: 0,
        type: 'user_message',
        payload: { text: 'done' },
        createdAt: 0,
      },
      {
        id: 8,
        sessionId: 1,
        sequence: 1,
        type: 'turn_start',
        payload: { messageId: 7 },
        createdAt: 0,
      },
      { id: 9, sessionId: 1, sequence: 2, type: 'turn_complete', payload: {}, createdAt: 0 },
    ]
    const worker = {
      setActive: async () => ({}),
      listEvents: async () => events,
      emitEvent: async (type: string) => {
        calls.push({ type })
        return {} as never
      },
    } as unknown as WorkerClient
    const qf: QueryFn = () => {
      throw new Error('should not run a turn for an already-started message')
    }
    // Nothing to reconcile → nothing drains; abort shortly so the daemon exits.
    setTimeout(() => controller.abort(), 20)

    await runDaemon(
      cfg,
      { worker, queryFn: qf, eventSourceImpl: openOnConnect(), log: () => {} },
      controller.signal,
    )

    assert.deepEqual(calls, [])
  })

  test('heals an orphaned open turn (turn_start, no close) left by a prior child', async () => {
    const controller = new AbortController()
    const calls: Array<{ type: string; payload: unknown }> = []
    // A dangling open turn: turn_start with no trailing close (prior child died).
    const events: SessionEvent[] = [
      {
        id: 7,
        sessionId: 1,
        sequence: 0,
        type: 'user_message',
        payload: { text: 'x' },
        createdAt: 0,
      },
      {
        id: 8,
        sessionId: 1,
        sequence: 1,
        type: 'turn_start',
        payload: { messageId: 7 },
        createdAt: 0,
      },
    ]
    const worker = {
      setActive: async () => ({}),
      listEvents: async () => events,
      emitEvent: async (type: string, payload: unknown) => {
        calls.push({ type, payload })
        if (type === 'turn_error') controller.abort() // exit once healed
        return {} as never
      },
    } as unknown as WorkerClient
    const qf: QueryFn = () => {
      throw new Error('should not run a turn for an orphaned open turn')
    }

    await runDaemon(
      cfg,
      { worker, queryFn: qf, eventSourceImpl: openOnConnect(), log: () => {} },
      controller.signal,
    )

    assert.deepEqual(
      calls.map(c => c.type),
      ['turn_error'],
    )
    assert.equal((calls[0]?.payload as { synthetic?: boolean }).synthetic, true)
  })

  test('interrupt with no live turn closes a later-orphaned open turn', async () => {
    const controller = new AbortController()
    const calls: Array<{ type: string; payload: unknown }> = []
    // Empty at connect (reconcile heals nothing); the orphan appears afterwards.
    let phase = 0
    const orphan: SessionEvent[] = [
      {
        id: 7,
        sessionId: 1,
        sequence: 0,
        type: 'user_message',
        payload: { text: 'x' },
        createdAt: 0,
      },
      {
        id: 8,
        sessionId: 1,
        sequence: 1,
        type: 'turn_start',
        payload: { messageId: 7 },
        createdAt: 0,
      },
    ]
    const worker = {
      setActive: async () => ({}),
      listEvents: async () => (phase === 0 ? [] : orphan),
      emitEvent: async (type: string, payload: unknown) => {
        calls.push({ type, payload })
        if (type === 'turn_error') controller.abort()
        return {} as never
      },
    } as unknown as WorkerClient
    const qf: QueryFn = () => {
      throw new Error('should not run a turn')
    }
    const es = controllableES()
    const run = runDaemon(
      cfg,
      { worker, queryFn: qf, eventSourceImpl: es.ctor, log: () => {} },
      controller.signal,
    )
    await es.opened
    await new Promise(r => setTimeout(r, 10)) // let the connect-time reconcile settle (no heal)
    phase = 1
    es.emit({ id: 9, sessionId: 1, sequence: 2, type: 'system', payload: { action: 'interrupt' } })
    await run

    assert.deepEqual(
      calls.map(c => c.type),
      ['turn_error'],
    )
    assert.equal((calls[0]?.payload as { synthetic?: boolean }).synthetic, true)
  })
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
