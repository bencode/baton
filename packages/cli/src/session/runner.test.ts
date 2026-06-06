import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import type { QueryFn } from './runner/query.ts'
import { runTurn, shouldReap } from './runner.ts'

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
