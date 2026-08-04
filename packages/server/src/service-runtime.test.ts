import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createServiceRuntime } from './service-runtime.ts'

describe('service runtime', () => {
  test('replaces a worker snapshot and expires it by TTL', () => {
    const runtime = createServiceRuntime(90)
    runtime.replace(
      7,
      [
        {
          sessionId: 3,
          name: 'web',
          startedAt: 10,
          publicUrl: 'https://jingzhe.fmap.dev',
          note: 'Spec Factory preview',
        },
      ],
      100,
    )

    assert.deepEqual(runtime.listWorker(7, 189), [
      {
        workerId: 7,
        sessionId: 3,
        name: 'web',
        startedAt: 10,
        publicUrl: 'https://jingzhe.fmap.dev',
        note: 'Spec Factory preview',
      },
    ])
    assert.deepEqual(runtime.listWorker(7, 190), [])
  })

  test('isolates equal names by worker and treats reports as full snapshots', () => {
    const runtime = createServiceRuntime()
    runtime.replace(
      7,
      [{ sessionId: 3, name: 'web', startedAt: 10, publicUrl: 'https://one.example.com' }],
      100,
    )
    runtime.replace(
      8,
      [{ sessionId: 4, name: 'web', startedAt: 20, publicUrl: 'https://two.example.com' }],
      100,
    )
    runtime.replace(7, [], 101)

    assert.deepEqual(runtime.listWorkers([7, 8], 102), [
      {
        workerId: 8,
        sessionId: 4,
        name: 'web',
        startedAt: 20,
        publicUrl: 'https://two.example.com',
      },
    ])
  })

  test('resolves a pending command result', async () => {
    const runtime = createServiceRuntime(90, 1_000)
    const result = runtime.expect('request-1')
    runtime.resolve({ requestId: 'request-1', ok: true })

    assert.deepEqual(await result, { requestId: 'request-1', ok: true })
  })
})
