import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { SessionEvent } from '@baton/shared'
import type { ApiClient } from '../../client.ts'
import { renderTell, sendTell, TELL_LOOP_LIMIT } from './tell.ts'

const message = (text: string): SessionEvent => ({
  id: 1,
  sessionId: 12,
  sequence: 1,
  type: 'user_message',
  payload: { text },
  createdAt: 0,
})

const tellFrom = (id: number): string => renderTell({ id, name: 'peer' }, 'hello')
const tells = (count: number): SessionEvent[] =>
  Array.from({ length: count }, () => message(tellFrom(34)))

const fakeClient = (events: SessionEvent[]) => {
  const sent: [number, string][] = []
  const read: number[] = []
  const client = {
    sessions: {
      get: async (id: number) => {
        read.push(id)
        return { id, name: 'fix "login"' }
      },
      listEvents: async (id: number) => {
        read.push(id)
        return events
      },
      sendMessage: async (id: number, text: string) => {
        sent.push([id, text])
        return { input: { id: 56 } }
      },
    },
  } as unknown as ApiClient
  return { client, sent, read }
}

const input = { fromId: 12, toId: 34, body: 'is the refresh API unchanged?' }

describe('session tell', () => {
  test('delivers the body with the sender and how to reply', async () => {
    const { client, sent } = fakeClient([])
    await sendTell(client, input)
    assert.deepEqual(sent, [
      [
        34,
        [
          '[Message from baton session #12 "fix \\"login\\""]',
          'To reply, run: baton session tell 12 "<your reply>"',
          'Reply only if a response is actually needed.',
          '',
          'is the refresh API unchanged?',
        ].join('\n'),
      ],
    ])
  })

  test('sends below the limit and refuses at it without delivering', async () => {
    const below = fakeClient(tells(TELL_LOOP_LIMIT - 1))
    await sendTell(below.client, input)
    assert.equal(below.sent.length, 1)

    const atLimit = fakeClient(tells(TELL_LOOP_LIMIT))
    await assert.rejects(sendTell(atLimit.client, input), /Stop and ask a human/)
    assert.equal(atLimit.sent.length, 0)
  })

  test('a message from anyone else resets the count', async () => {
    const { client, sent } = fakeClient([...tells(TELL_LOOP_LIMIT), message('carry on')])
    await sendTell(client, input)
    assert.equal(sent.length, 1)
  })

  test('counts every header in a merged message', async () => {
    const merged = Array.from({ length: TELL_LOOP_LIMIT }, () => tellFrom(34)).join('\n\n')
    const { client, sent } = fakeClient([message(merged)])
    await assert.rejects(sendTell(client, input), /Stop and ask a human/)
    assert.equal(sent.length, 0)
  })

  test('only reads the sender session', async () => {
    const { client, read } = fakeClient([])
    await sendTell(client, input)
    assert.deepEqual([...new Set(read)], [12])
  })

  test('refuses to message its own session', async () => {
    const { client, sent, read } = fakeClient([])
    await assert.rejects(sendTell(client, { ...input, toId: 12 }), /own session/)
    assert.deepEqual([sent, read], [[], []])
  })
})
