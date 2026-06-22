import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import type { ApiClient, WorkerRegisterOutput } from '../client.ts'
import { parseWorkerHandle } from '../util.ts'
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

  test('registerWorker: forwards inputs, patches worker section into .baton.json', async () => {
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
                createdAt: 0,
                connected: true,
              },
              apiToken: 'wtok-test',
              outcome: 'created',
            }
          },
        },
      } as unknown as ApiClient
      const cfgPath = join(dir, '.baton.json')
      const { out, configPath } = await registerWorker(
        c,
        {
          projectId: 1,
          name: 'ben-laptop',
          server: 'http://localhost:3280',
          hostname: 'bens-air.local',
          machineId: 'mid-abc',
        },
        cfgPath,
      )
      assert.equal(out.outcome, 'created')
      assert.equal(out.worker.id, 42)
      assert.equal(configPath, cfgPath)
      assert.deepEqual(registeredWith, {
        projectId: 1,
        machineId: 'mid-abc',
        name: 'ben-laptop',
        hostname: 'bens-air.local',
      })
      const saved = JSON.parse(readFileSync(configPath, 'utf8'))
      assert.equal(saved.server, 'http://localhost:3280')
      assert.equal(saved.project, 1)
      assert.equal(saved.worker.id, 42)
      assert.equal(saved.worker.machineId, 'mid-abc')
      assert.equal(saved.worker.name, 'ben-laptop')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('parseWorkerHandle', () => {
  test('accepts W-N / w-N / bare int; rejects names', () => {
    assert.equal(parseWorkerHandle('7'), 7)
    assert.equal(parseWorkerHandle('W-7'), 7)
    assert.equal(parseWorkerHandle('w-12'), 12)
    assert.equal(parseWorkerHandle(' W-3 '), 3)
    assert.equal(parseWorkerHandle('daily-pro'), null)
    assert.equal(parseWorkerHandle('W-'), null)
    assert.equal(parseWorkerHandle(''), null)
  })
})
