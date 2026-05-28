import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient } from './client.ts'
import { setRequirementStatus } from './commands/requirement.ts'
import { newSession } from './commands/session.ts'
import { createTask } from './commands/task.ts'
import { createWorkspace, removeWorkspace } from './commands/workspace.ts'
import { splitCsv } from './util.ts'

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
