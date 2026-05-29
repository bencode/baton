import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient, WorkerRegisterOutput } from '../client.ts'
import { readOrCreateMachineId } from '../worker/machine-id.ts'
import { registerWorker } from './worker.ts'

describe('worker helpers', () => {
  test('readOrCreateMachineId: writes a UUID on first call; round-trips on second', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-mid-'))
    try {
      const path = join(dir, 'machine-id')
      const first = readOrCreateMachineId(path)
      assert.match(first, /^[0-9a-f-]{36}$/)
      assert.equal(readFileSync(path, 'utf8').trim(), first)
      const second = readOrCreateMachineId(path)
      assert.equal(second, first)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('registerWorker: forwards inputs, saves worker config with returned id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-wc-'))
    try {
      let registeredWith: unknown = null
      const c = {
        workers: {
          register: async (input: unknown): Promise<WorkerRegisterOutput> => {
            registeredWith = input
            return {
              worker: {
                id: 42,
                projectId: 1,
                machineId: (input as { machineId: string }).machineId,
                name: (input as { name: string }).name,
                hostname: (input as { hostname: string }).hostname,
                startedAt: 0,
                alive: true,
              },
              outcome: 'created',
            }
          },
        },
      } as unknown as ApiClient
      const { out, configPath } = await registerWorker(
        c,
        {
          projectId: 1,
          name: 'ben-laptop',
          server: 'http://localhost:3280',
          hostname: 'bens-air.local',
          machineId: 'mid-abc',
        },
        pid => join(dir, `worker-${pid}.json`),
      )
      assert.equal(out.outcome, 'created')
      assert.equal(out.worker.id, 42)
      assert.deepEqual(registeredWith, {
        projectId: 1,
        machineId: 'mid-abc',
        name: 'ben-laptop',
        hostname: 'bens-air.local',
      })
      const saved = JSON.parse(readFileSync(configPath, 'utf8'))
      assert.equal(saved.workerId, 42)
      assert.equal(saved.machineId, 'mid-abc')
      assert.equal(saved.name, 'ben-laptop')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
