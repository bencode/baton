import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ApiClient } from './client.ts'
import { setRequirementStatus } from './commands/requirement.ts'
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
        create: async (i: { name: string }) => ({ id: 'w1', name: i.name, createdAt: 0 }),
      },
    } as unknown as ApiClient
    assert.equal(await createWorkspace(c, 'eng', false), 'w1  eng')
  })

  test('removeWorkspace calls remove and reports', async () => {
    let removedId = ''
    const c = {
      workspaces: {
        remove: async (id: string) => {
          removedId = id
        },
      },
    } as unknown as ApiClient
    assert.equal(await removeWorkspace(c, 'w9', false), 'deleted workspace w9')
    assert.equal(removedId, 'w9')
  })

  test('setRequirementStatus passes id + status through', async () => {
    let got: [string, string] | null = null
    const c = {
      requirements: {
        setStatus: async (id: string, status: string) => {
          got = [id, status]
          return {
            id,
            projectId: 'p',
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
    const out = await setRequirementStatus(c, 'r1', 'done', false)
    assert.deepEqual(got, ['r1', 'done'])
    assert.match(out, /\[done\]/)
  })

  test('createTask forwards the parsed input', async () => {
    let input: unknown = null
    const c = {
      tasks: {
        create: async (i: unknown) => {
          input = i
          return {
            id: 't1',
            requirementId: 'r1',
            title: 'impl',
            requires: ['x'],
            dependsOn: ['a'],
            status: 'todo',
            createdAt: 0,
            updatedAt: 0,
          }
        },
      },
    } as unknown as ApiClient
    const out = await createTask(
      c,
      { requirementId: 'r1', title: 'impl', requires: ['x'], dependsOn: ['a'] },
      false,
    )
    assert.deepEqual(input, {
      requirementId: 'r1',
      title: 'impl',
      requires: ['x'],
      dependsOn: ['a'],
    })
    assert.match(out, /t1.*\[todo\].*impl/)
  })
})
