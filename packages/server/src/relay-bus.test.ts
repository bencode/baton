import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createRelayBus } from './relay-bus.ts'

describe('relay-bus', () => {
  test('create yields distinct ids + tokens; auth verdicts', () => {
    const relay = createRelayBus()
    const a = relay.create()
    const b = relay.create()
    assert.notEqual(a.channelId, b.channelId)
    assert.notEqual(a.token, b.token)
    assert.equal(relay.auth(a.channelId, a.token), 'ok')
    assert.equal(relay.auth(a.channelId, 'wrong'), 'forbidden')
    assert.equal(relay.auth('no-such-channel', a.token), 'unknown')
  })

  test('append stamps a monotonic seq and publishes to subscribers', () => {
    const relay = createRelayBus()
    const { channelId } = relay.create()
    const seen: number[] = []
    const off = relay.bus.subscribe(channelId, m => seen.push(m.seq))
    const m1 = relay.append(channelId, { from: 'a', text: 'hi' })
    const m2 = relay.append(channelId, { from: 'b', text: 'yo' })
    off()
    assert.equal(m1?.seq, 1)
    assert.equal(m2?.seq, 2)
    assert.equal(m1?.from, 'a')
    assert.deepEqual(seen, [1, 2])
  })

  test('append to an unknown channel returns null', () => {
    const relay = createRelayBus()
    assert.equal(relay.append('nope', { from: 'a', text: 'x' }), null)
  })

  test('since() returns only messages strictly after the cursor', () => {
    const relay = createRelayBus()
    const { channelId } = relay.create()
    relay.append(channelId, { from: 'a', text: '1' })
    relay.append(channelId, { from: 'a', text: '2' })
    relay.append(channelId, { from: 'a', text: '3' })
    assert.deepEqual(
      relay.since(channelId, 1).map(m => m.text),
      ['2', '3'],
    )
    assert.deepEqual(relay.since(channelId, 3), [])
    assert.deepEqual(relay.since('unknown', 0), [])
  })

  test('history is bounded: oldest drop, seq keeps climbing', () => {
    const relay = createRelayBus()
    const { channelId } = relay.create()
    for (let i = 0; i < 250; i++) relay.append(channelId, { from: 'a', text: `m${i}` })
    const buffered = relay.since(channelId, 0)
    assert.equal(buffered.length, 200) // HISTORY_MAX
    assert.equal(buffered[0]?.seq, 51) // first 50 dropped
    assert.equal(buffered[buffered.length - 1]?.seq, 250)
  })
})
