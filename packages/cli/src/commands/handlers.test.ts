import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { ApiClient } from '../client.ts'
import { updateProject } from './project.ts'
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
})
