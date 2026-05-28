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
