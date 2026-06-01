import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import { updateProject } from './project.ts'
import { setRequirementStatus } from './requirement.ts'
import { addTaskComment, createTask, listTaskComments } from './task.ts'
import { createWorkspace, removeWorkspace, updateWorkspace } from './workspace.ts'

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

  test('updateWorkspace forwards id + name and renders', async () => {
    let got: [number, { name?: string }] | null = null
    const c = {
      workspaces: {
        update: async (id: number, patch: { name?: string }) => {
          got = [id, patch]
          return { id, name: patch.name, createdAt: 0 }
        },
      },
    } as unknown as ApiClient
    assert.equal(await updateWorkspace(c, 2, 'trantor', false), '2  trantor')
    assert.deepEqual(got, [2, { name: 'trantor' }])
  })

  test('updateProject forwards id + patch and renders', async () => {
    let got: [number, { name?: string; description?: string }] | null = null
    const c = {
      projects: {
        update: async (id: number, patch: { name?: string; description?: string }) => {
          got = [id, patch]
          return { id, workspaceId: 1, name: patch.name ?? 'x', createdAt: 0 }
        },
      },
    } as unknown as ApiClient
    assert.equal(await updateProject(c, 2, { name: 'daily', description: 'd' }, false), '2  daily')
    assert.deepEqual(got, [2, { name: 'daily', description: 'd' }])
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

  test('addTaskComment forwards (taskId, body, workerId) and renders attribution', async () => {
    let got: [number, string, number | undefined] | null = null
    const c = {
      tasks: {
        addComment: async (id: number, body: string, workerId?: number) => {
          got = [id, body, workerId]
          return { id: 5, taskId: id, body, workerId, createdAt: 0 }
        },
      },
    } as unknown as ApiClient
    const out = await addTaskComment(c, 7, 'hand-off', 3, false)
    assert.deepEqual(got, [7, 'hand-off', 3])
    assert.equal(out, 'worker#3  hand-off')
  })

  test('listTaskComments renders comments in order, human author as "you"', async () => {
    const c = {
      tasks: {
        listComments: async (id: number) => [
          { id: 1, taskId: id, body: 'human note', createdAt: 0 },
          { id: 2, taskId: id, body: 'agent note', workerId: 3, createdAt: 0 },
        ],
      },
    } as unknown as ApiClient
    const out = await listTaskComments(c, 7, false)
    assert.equal(out, 'you  human note\nworker#3  agent note')
  })
})
