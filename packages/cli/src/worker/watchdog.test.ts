import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { stale, streamWedged } from './watchdog.ts'

describe('stale', () => {
  test('true only once okAt is older than the threshold', () => {
    assert.equal(stale(1000, 1000 + 30_000, 90_000), false) // within window
    assert.equal(stale(1000, 1000 + 90_000, 90_000), false) // exactly at window
    assert.equal(stale(1000, 1000 + 90_001, 90_000), true) // past window
  })
})

describe('streamWedged', () => {
  const T = 90_000
  test('an open stream is never wedged, even when idle past the window', () => {
    assert.equal(streamWedged(true, 0, 1_000_000, T), false)
  })
  test('not-open but still within the window is tolerated (brief reconnect)', () => {
    assert.equal(streamWedged(false, 1000, 1000 + 30_000, T), false)
  })
  test('not-open past the window is wedged (stuck retrying)', () => {
    assert.equal(streamWedged(false, 1000, 1000 + 90_001, T), true)
  })
})
