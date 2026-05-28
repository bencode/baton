import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient, WorkerClient } from './client.ts'
import { setRequirementStatus } from './commands/requirement.ts'
import { createTask } from './commands/task.ts'
import { registerWorker } from './commands/worker.ts'
import { createWorkspace, removeWorkspace } from './commands/workspace.ts'
import { splitCsv } from './util.ts'
import { echoBackend } from './worker/backends.ts'
import { runLoop } from './worker/runner.ts'

describe('splitCsv', () => {
  test('parses / trims / drops empties; undefined when absent', () => {
    assert.deepEqual(splitCsv('a, b ,,c'), ['a', 'b', 'c'])
    assert.equal(splitCsv(undefined), undefined)
    assert.equal(splitCsv(''), undefined)
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

  test('registerWorker saves config json with token + identity', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-worker-'))
    try {
      const c = {
        sessions: {
          register: async (input: {
            projectId: number
            mode: string
            name: string
            capabilities?: string[]
          }) => ({
            id: 7,
            code: 'S-1',
            projectId: input.projectId,
            mode: input.mode,
            name: input.name,
            capabilities: input.capabilities ?? [],
            status: 'active',
            startedAt: 0,
            heartbeatAt: 0,
            apiToken: 'tok-deadbeef',
          }),
        },
      } as unknown as ApiClient
      const { config, path } = await registerWorker(
        c,
        'http://localhost:3280',
        { projectId: 1, name: 'ben-laptop', mode: 'worker', capabilities: ['node', 'claude'] },
        code => join(dir, `worker-${code}.json`),
      )
      assert.equal(config.sessionCode, 'S-1')
      assert.equal(config.apiToken, 'tok-deadbeef')
      const saved = JSON.parse(readFileSync(path, 'utf8'))
      assert.equal(saved.apiToken, 'tok-deadbeef')
      assert.deepEqual(saved.capabilities, ['node', 'claude'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('runLoop iterates one echo backend cycle: 3 events + complete done', async () => {
    const events: Array<{ sequence: number; payload: unknown }> = []
    let completed: { status: string; result?: string } | null = null
    let claims = 0
    const heartbeats: number[] = []
    const wc = {
      heartbeat: async () => {
        heartbeats.push(Date.now())
        return {} as never
      },
      claim: async () => {
        claims += 1
        if (claims > 1) return null
        return {
          assignment: { id: 42, code: 'A-1' } as never,
          task: { id: 1, code: 'T-1', title: 'hello', spec: 'do it' } as never,
        }
      },
      close: async () => {},
      appendEvent: async (_id: number, sequence: number, payload: unknown) => {
        events.push({ sequence, payload })
        return {} as never
      },
      complete: async (_id: number, status: 'done' | 'failed', result?: string) => {
        completed = { status, result }
        return {} as never
      },
      abandon: async () => ({}) as never,
    } as unknown as WorkerClient

    let ticks = 0
    await runLoop(wc, echoBackend, {
      pollIntervalMs: 1,
      heartbeatMs: 999_999, // never fires within the test
      shouldContinue: () => {
        ticks += 1
        return ticks <= 2
      },
    })

    assert.equal(events.length, 3)
    assert.deepEqual(
      events.map(e => e.sequence),
      [0, 1, 2],
    )
    assert.deepEqual(completed, { status: 'done', result: 'echo-done' })
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
            requires: ['x'],
            dependsOn: [2],
            status: 'todo',
            createdAt: 0,
            updatedAt: 0,
          }
        },
      },
    } as unknown as ApiClient
    const out = await createTask(
      c,
      { requirementId: 1, title: 'impl', requires: ['x'], dependsOn: [2] },
      false,
    )
    assert.deepEqual(input, { requirementId: 1, title: 'impl', requires: ['x'], dependsOn: [2] })
    assert.match(out, /T-1.*\[todo\].*impl/)
  })
})
