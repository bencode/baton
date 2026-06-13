import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createPubSub } from './pubsub.ts'

// `has` backs the per-worker "connected" signal on the command bus: a key is
// connected iff it currently has ≥1 live subscriber (the daemon's stream).
describe('pubsub has', () => {
  test('false before subscribe, true while subscribed, false after unsubscribe', () => {
    const bus = createPubSub<number>('test')
    assert.equal(bus.has(7), false)
    const off = bus.subscribe(7, () => {})
    assert.equal(bus.has(7), true)
    // A second key stays independent.
    assert.equal(bus.has(8), false)
    off()
    assert.equal(bus.has(7), false)
  })

  test('stays connected until the last subscriber leaves', () => {
    const bus = createPubSub<number>('test')
    const a = bus.subscribe(1, () => {})
    const b = bus.subscribe(1, () => {})
    a()
    assert.equal(bus.has(1), true) // b still here
    b()
    assert.equal(bus.has(1), false)
  })
})
