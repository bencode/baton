import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createBusy } from './busy.ts'

describe('busy tracker (turn liveness + TTL)', () => {
  const ttl = 1000

  test('open → busy within the TTL window, not busy past it', () => {
    const b = createBusy()
    b.open(1, 0)
    assert.equal(b.read(1, 500, ttl), true) // within window
    assert.equal(b.read(1, 1000, ttl), false) // exactly at TTL → expired
    assert.equal(b.read(1, 5000, ttl), false) // long past
  })

  test('refresh bumps liveness; refresh on a closed turn is a no-op', () => {
    const b = createBusy()
    b.open(1, 0)
    b.refresh(1, 900)
    assert.equal(b.read(1, 1500, ttl), true) // last activity 900 → still fresh at 1500
    b.close(1)
    b.refresh(1, 2000) // no open turn → cannot re-arm
    assert.equal(b.read(1, 2000, ttl), false)
  })

  test('close and forget both clear busy', () => {
    const b = createBusy()
    b.open(1, 0)
    b.close(1)
    assert.equal(b.read(1, 0, ttl), false)
    b.open(2, 0)
    b.forget(2)
    assert.equal(b.read(2, 0, ttl), false)
  })

  test('markStale makes an open turn read stale immediately', () => {
    const b = createBusy()
    b.open(1, 1000)
    assert.equal(b.read(1, 1000, ttl), true)
    b.markStale(1)
    assert.equal(b.read(1, 1000, ttl), false) // lastActivityAt forced to 0
  })

  test('expired lists only open turns past the TTL', () => {
    const b = createBusy()
    b.open(1, 0) // stale at now=2000
    b.open(2, 1500) // fresh at now=2000
    assert.deepEqual(b.expired(2000, ttl), [1])
    b.close(1)
    assert.deepEqual(b.expired(2000, ttl), [])
  })
})
