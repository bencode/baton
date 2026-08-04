import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createLiveness } from './liveness.ts'

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

describe('worker liveness', () => {
  test('service report failure does not count as heartbeat failure', async () => {
    const logs: string[] = []
    const liveness = createLiveness({
      heartbeat: async () => {},
      reportRuntime: async () => {
        throw new Error('report unavailable')
      },
      log: message => logs.push(message),
      isStreamOpen: () => true,
      onTrip: () => {},
    })

    liveness.start()
    await flush()
    liveness.stop()

    assert.deepEqual(logs, ['service report failed: Error: report unavailable'])
  })

  test('heartbeat failure keeps its own error path', async () => {
    const logs: string[] = []
    const liveness = createLiveness({
      heartbeat: async () => {
        throw new Error('heartbeat unavailable')
      },
      reportRuntime: async () => {},
      log: message => logs.push(message),
      isStreamOpen: () => true,
      onTrip: () => {},
    })

    liveness.start()
    await flush()
    liveness.stop()

    assert.deepEqual(logs, ['heartbeat failed: Error: heartbeat unavailable'])
  })
})
