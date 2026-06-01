import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, test } from 'node:test'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import { runTurn, shouldReap } from './runner.ts'

describe('runTurn', () => {
  test('posts turn_start + N sdk_event + turn_complete; flags first vs resume', async () => {
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

    // Fake spawn: returns a child whose stdout emits 3 stream-json lines, then exits.
    // The 'exit' must fire *after* readline drains stdout, otherwise the runTurn
    // listener that awaits 'exit' would be registered too late (microtask races).
    type FakeChild = EventEmitter & { stdout: Readable }
    const makeChild = (lines: string[]): FakeChild => {
      const child = new EventEmitter() as FakeChild
      child.stdout = Readable.from(lines)
      child.stdout.on('end', () => setImmediate(() => child.emit('exit', 0)))
      return child
    }

    let spawnArgs: string[] = []
    const fakeSpawn = ((_cmd: string, args: ReadonlyArray<string>) => {
      spawnArgs = [...args]
      return makeChild([
        `${JSON.stringify({ type: 'assistant', message: { content: 'hi' } })}\n`,
        `${JSON.stringify({ type: 'tool_use', name: 'Read' })}\n`,
        `${JSON.stringify({ type: 'result', subtype: 'success' })}\n`,
      ]) as never
    }) as never

    // first turn → --session-id
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
      fakeSpawn,
    )
    assert.ok(spawnArgs.includes('--session-id'))
    assert.ok(!spawnArgs.includes('--resume'))
    assert.deepEqual(
      calls.map(c => c.type),
      ['turn_start', 'sdk_event', 'sdk_event', 'sdk_event', 'turn_complete'],
    )
    assert.deepEqual(calls[0]?.payload, { messageId: 99 })
    assert.deepEqual(calls[4]?.payload, { exitCode: 0 })
    assert.equal(code1, 0)

    // second turn → --resume
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
      fakeSpawn,
    )
    assert.ok(spawnArgs.includes('--resume'))
    assert.ok(!spawnArgs.includes('--session-id'))
  })

  test('empty text → turn_error, no spawn', async () => {
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
    let spawned = false
    const fakeSpawn = (() => {
      spawned = true
      throw new Error('should not be called')
    }) as unknown as never
    await runTurn(
      cfg,
      worker,
      { id: 1, sessionId: 1, sequence: 0, type: 'user_message', payload: {}, createdAt: 0 },
      false,
      fakeSpawn,
    )
    assert.equal(spawned, false)
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

    type FakeChild = EventEmitter & { stdout: Readable }
    let promptArg = ''
    const fakeSpawn = ((_cmd: string, args: ReadonlyArray<string>) => {
      promptArg = args[args.length - 1] ?? ''
      const child = new EventEmitter() as FakeChild
      child.stdout = Readable.from([`${JSON.stringify({ type: 'result' })}\n`])
      child.stdout.on('end', () => setImmediate(() => child.emit('exit', 0)))
      return child as never
    }) as unknown as never

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
        fakeSpawn,
        () => {},
        undefined,
        fetchImpl,
      )
      assert.equal(code, 0)
      assert.match(promptArg, /attachments\/shot\.png/)
      assert.ok(promptArg.includes('describe'))
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
