import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { freshStore, type TestStore } from '../test-db.ts'

describe('store channels', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  test('create yields distinct ids + tokens; get round-trips title + description (no token leak)', async () => {
    const a = await ctx.store.channels.create({ title: 'design', description: 'design sync room' })
    const b = await ctx.store.channels.create({})
    assert.notEqual(a.channel.id, b.channel.id)
    assert.notEqual(a.token, b.token)
    assert.equal(a.channel.title, 'design')
    assert.equal(a.channel.description, 'design sync room')
    assert.equal(b.channel.title, undefined)
    assert.equal(b.channel.description, undefined)
    const got = await ctx.store.channels.get(a.channel.id)
    assert.equal(got?.title, 'design')
    assert.equal(got?.description, 'design sync room')
    assert.equal((got as { token?: string } | null)?.token, undefined)
    assert.equal(await ctx.store.channels.get('missing'), null)
  })

  test('auth verdicts: ok / forbidden / unknown', async () => {
    const { channel, token } = await ctx.store.channels.create({})
    assert.equal(await ctx.store.channels.auth(channel.id, token), 'ok')
    assert.equal(await ctx.store.channels.auth(channel.id, 'wrong'), 'forbidden')
    assert.equal(await ctx.store.channels.auth('nope', token), 'unknown')
  })

  test('appendMessage: 1-based seq; maps from/ts/senderKind/to', async () => {
    const { channel } = await ctx.store.channels.create({})
    const m1 = await ctx.store.channels.appendMessage(channel.id, {
      sender: 'alice',
      senderKind: 'human',
      text: 'hi',
    })
    const m2 = await ctx.store.channels.appendMessage(channel.id, {
      sender: 'bob',
      senderKind: 'agent',
      text: 'yo',
      to: ['alice'],
    })
    assert.equal(m1.seq, 1)
    assert.equal(m2.seq, 2)
    assert.equal(m1.from, 'alice')
    assert.equal(m1.senderKind, 'human')
    assert.equal(m1.to, undefined) // no recipients = broadcast
    assert.deepEqual(m2.to, ['alice'])
    assert.ok(m1.ts > 0)
  })

  test('concurrent appends get contiguous, unique seqs (atomic tx)', async () => {
    const { channel } = await ctx.store.channels.create({})
    const out = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        ctx.store.channels.appendMessage(channel.id, {
          sender: 'a',
          senderKind: 'agent',
          text: `m${i}`,
        }),
      ),
    )
    assert.deepEqual(
      out.map(m => m.seq).sort((x, y) => x - y),
      [1, 2, 3, 4, 5, 6, 7, 8],
    )
  })

  test('destroy removes the channel and cascades its messages', async () => {
    const { channel } = await ctx.store.channels.create({})
    await ctx.store.channels.appendMessage(channel.id, {
      sender: 'a',
      senderKind: 'agent',
      text: 'x',
    })
    await ctx.store.channels.destroy(channel.id)
    assert.equal(await ctx.store.channels.get(channel.id), null)
    assert.deepEqual(await ctx.store.channels.since(channel.id, 0), []) // messages cascaded away
  })

  test('since: strictly-after, ascending, capped by limit', async () => {
    const { channel } = await ctx.store.channels.create({})
    for (const t of ['1', '2', '3'])
      await ctx.store.channels.appendMessage(channel.id, { sender: 'a', senderKind: 'agent', text: t })
    assert.deepEqual((await ctx.store.channels.since(channel.id, 1)).map(m => m.text), ['2', '3'])
    assert.deepEqual(await ctx.store.channels.since(channel.id, 3), [])
    assert.deepEqual(await ctx.store.channels.since('unknown', 0), [])
    assert.equal((await ctx.store.channels.since(channel.id, 0, 2)).length, 2)
  })
})
