import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, test } from 'node:test'
import type { ApiClient, WorkerClient } from './client.ts'
import { setRequirementStatus } from './commands/requirement.ts'
import { newSession, parseEnvPairs } from './commands/session.ts'
import { createTask } from './commands/task.ts'
import { createWorkspace, removeWorkspace } from './commands/workspace.ts'
import type { SessionConfig } from './session/config.ts'
import { runTurn } from './session/runner.ts'
import { splitCsv } from './util.ts'

describe('splitCsv', () => {
  test('parses / trims / drops empties; undefined when absent', () => {
    assert.deepEqual(splitCsv('a, b ,,c'), ['a', 'b', 'c'])
    assert.equal(splitCsv(undefined), undefined)
    assert.equal(splitCsv(''), undefined)
  })
})

describe('parseEnvPairs', () => {
  test('single KEY=VAL', () => {
    assert.deepEqual(parseEnvPairs('FOO=bar'), { FOO: 'bar' })
  })
  test('array of pairs', () => {
    assert.deepEqual(parseEnvPairs(['A=1', 'B=2']), { A: '1', B: '2' })
  })
  test('value containing = sign', () => {
    assert.deepEqual(parseEnvPairs('URL=https://x/api?a=b'), { URL: 'https://x/api?a=b' })
  })
  test('undefined → undefined', () => {
    assert.equal(parseEnvPairs(undefined), undefined)
  })
  test('missing = throws', () => {
    assert.throws(() => parseEnvPairs('JUSTAKEY'), /KEY=VAL/)
  })
})

describe('command handlers (fake client)', () => {
  test('createWorkspace renders the created workspace', async () => {
    const c = {
      workspaces: {
        create: async (i: { name: string }) => ({ id: 1, name: i.name, createdAt: 0 }),
      },
    } as unknown as ApiClient
    assert.equal(await createWorkspace(c, 'eng', false), '1  eng')
  })

  test('removeWorkspace calls remove and reports', async () => {
    let removedId: number | null = null
    const c = {
      workspaces: {
        remove: async (id: number) => {
          removedId = id
        },
      },
    } as unknown as ApiClient
    assert.equal(await removeWorkspace(c, 9, false), 'deleted workspace 9')
    assert.equal(removedId, 9)
  })

  test('setRequirementStatus passes id + status through', async () => {
    let got: [number, string] | null = null
    const c = {
      requirements: {
        setStatus: async (id: number, status: string) => {
          got = [id, status]
          return {
            id,
            projectId: 1,
            code: 'R-1',
            title: 't',
            resources: [],
            tags: [],
            status,
            createdAt: 0,
            updatedAt: 0,
          }
        },
      },
    } as unknown as ApiClient
    const out = await setRequirementStatus(c, 1, 'done', false)
    assert.deepEqual(got, [1, 'done'])
    assert.match(out, /R-1.*\[done\]/)
  })

  test('newSession provisions worktree + registers + saves config', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-session-'))
    try {
      let registeredWith: unknown = null
      const c = {
        sessions: {
          register: async (input: {
            projectId: number
            mode: string
            name: string
            claudeSessionId?: string
            worktreePath?: string
          }) => {
            registeredWith = input
            return {
              id: 7,
              projectId: input.projectId,
              code: 'S-1',
              mode: input.mode,
              name: input.name,
              state: 'idle',
              claudeSessionId: input.claudeSessionId,
              worktreePath: input.worktreePath,
              startedAt: 0,
              heartbeatAt: 0,
              apiToken: 'tok-deadbeef',
            }
          },
        },
      } as unknown as ApiClient
      let createdAt: { repo: string; worktreePath: string; base: string } | null = null
      const fakeFs = {
        createWorktree: (inp: {
          repo: string
          worktreePath: string
          sessionCode: string
          base: string
        }) => {
          createdAt = { repo: inp.repo, worktreePath: inp.worktreePath, base: inp.base }
        },
        removeWorktree: () => {},
      }
      const { config, path } = await newSession(
        c,
        {
          projectId: 1,
          name: 'dogfood',
          repo: '/tmp/source',
          base: 'main',
          worktreeDir: dir,
          mode: 'worker',
          server: 'http://localhost:3280',
        },
        fakeFs,
        code => join(dir, `cfg-${code}.json`),
      )
      assert.equal(config.sessionCode, 'S-1')
      assert.equal(config.apiToken, 'tok-deadbeef')
      assert.ok(createdAt)
      assert.equal((createdAt as { repo: string }).repo, '/tmp/source')
      assert.match((createdAt as { worktreePath: string }).worktreePath, /baton-session-/)
      const saved = JSON.parse(readFileSync(path, 'utf8'))
      assert.equal(saved.apiToken, 'tok-deadbeef')
      assert.equal(
        saved.claudeSessionId,
        (registeredWith as { claudeSessionId: string }).claudeSessionId,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('newSession rolls back worktree when register fails', async () => {
    let removed = false
    const c = {
      sessions: {
        register: async () => {
          throw new Error('boom')
        },
      },
    } as unknown as ApiClient
    const fakeFs = {
      createWorktree: () => {},
      removeWorktree: () => {
        removed = true
      },
    }
    await assert.rejects(
      newSession(
        c,
        {
          projectId: 1,
          name: 'rolling-back',
          repo: '/tmp/source',
          base: 'main',
          worktreeDir: '/tmp/wd',
          mode: 'worker',
          server: 'http://localhost:3280',
        },
        fakeFs,
        () => '/tmp/never-written.json',
      ),
      /boom/,
    )
    assert.equal(removed, true)
  })

  test('runTurn: posts turn_start + N sdk_event + turn_complete; flags first vs resume', async () => {
    const cfg: SessionConfig = {
      server: 'http://localhost:3280',
      apiToken: 'tok',
      sessionId: 1,
      sessionCode: 'S-1',
      projectId: 1,
      name: 'dogfood',
      mode: 'worker',
      claudeSessionId: '00000000-0000-0000-0000-000000000001',
      worktreePath: '/tmp/wt',
    }
    const calls: Array<{ type: string; payload: unknown }> = []
    const worker = {
      heartbeat: async () => ({}) as never,
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
    await runTurn(
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

  test('runTurn: empty text → turn_error, no spawn', async () => {
    const cfg: SessionConfig = {
      server: 's',
      apiToken: 't',
      sessionId: 1,
      sessionCode: 'S-1',
      projectId: 1,
      name: 'x',
      mode: 'worker',
      claudeSessionId: 'uuid',
      worktreePath: '/tmp/wt',
    }
    const calls: Array<{ type: string }> = []
    const worker = {
      heartbeat: async () => ({}) as never,
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

  test('createTask forwards the parsed input', async () => {
    let input: unknown = null
    const c = {
      tasks: {
        create: async (i: unknown) => {
          input = i
          return {
            id: 1,
            requirementId: 1,
            projectId: 1,
            code: 'T-1',
            title: 'impl',
            dependsOn: [2],
            status: 'todo',
            createdAt: 0,
            updatedAt: 0,
          }
        },
      },
    } as unknown as ApiClient
    const out = await createTask(c, { requirementId: 1, title: 'impl', dependsOn: [2] }, false)
    assert.deepEqual(input, { requirementId: 1, title: 'impl', dependsOn: [2] })
    assert.match(out, /T-1.*\[todo\].*impl/)
  })
})
