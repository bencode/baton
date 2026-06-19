import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createChannelPresence } from './channel-presence.ts'

// TTL is 90s; tests drive expiry by passing an explicit `now` to list/prune so
// there are no real sleeps.
describe('channel-presence', () => {
  test('touch + list returns members with kind', () => {
    const p = createChannelPresence()
    p.touch('c1', 'alice', 'human')
    p.touch('c1', 'bob', 'agent')
    assert.deepEqual(
      p
        .list('c1')
        .map(m => `${m.name}:${m.kind}`)
        .sort(),
      ['alice:human', 'bob:agent'],
    )
  })

  test('list on an unknown channel is empty', () => {
    assert.deepEqual(createChannelPresence().list('nope'), [])
  })

  test('TTL expiry drops stale members and cleans the room map', () => {
    const p = createChannelPresence()
    p.touch('c1', 'alice', 'agent')
    assert.deepEqual(p.list('c1', Date.now() + 91_000), [])
    assert.deepEqual(p.list('c1'), []) // room map removed by the lazy drop
  })

  test('a re-touch re-establishes presence after expiry (heartbeat)', () => {
    const p = createChannelPresence()
    p.touch('c1', 'alice', 'agent')
    assert.deepEqual(p.list('c1', Date.now() + 91_000), []) // expired + dropped
    p.touch('c1', 'alice', 'agent') // heartbeat
    assert.deepEqual(
      p.list('c1').map(m => m.name),
      ['alice'],
    )
  })

  test('leave removes immediately', () => {
    const p = createChannelPresence()
    p.touch('c1', 'alice', 'agent')
    p.leave('c1', 'alice')
    assert.deepEqual(p.list('c1'), [])
  })

  test('name collision merges to one entry; last kind wins', () => {
    const p = createChannelPresence()
    p.touch('c1', 'x', 'agent')
    p.touch('c1', 'x', 'human')
    const roster = p.list('c1')
    assert.equal(roster.length, 1)
    assert.equal(roster[0]?.kind, 'human')
  })

  test('prune drops stale entries and reports the count', () => {
    const p = createChannelPresence()
    p.touch('c1', 'a', 'agent')
    p.touch('c2', 'b', 'agent')
    assert.equal(p.prune(Date.now() + 91_000), 2)
    assert.deepEqual(p.list('c1'), [])
    assert.deepEqual(p.list('c2'), [])
  })
})
