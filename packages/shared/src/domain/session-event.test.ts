import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { type SessionEvent, startedMessageIds, unstartedUserMessages } from './session-event.ts'

const ev = (id: number, type: SessionEvent['type'], payload: unknown): SessionEvent => ({
  id,
  sessionId: 1,
  sequence: id,
  type,
  payload,
  createdAt: 0,
})

describe('unstartedUserMessages', () => {
  test('returns user_messages with no matching turn_start, in sequence order', () => {
    const events = [
      ev(1, 'user_message', { text: 'a' }), // started by turn_start below
      ev(2, 'turn_start', { messageId: 1 }),
      ev(3, 'turn_complete', {}),
      ev(4, 'user_message', { text: 'b' }), // queued — no turn_start
      ev(5, 'user_message', { text: 'c' }), // queued — no turn_start
    ]
    assert.deepEqual(
      unstartedUserMessages(events).map(e => e.id),
      [4, 5],
    )
  })

  test('a user_message whose turn started is excluded (no re-run on reconcile)', () => {
    const events = [ev(7, 'user_message', { text: 'x' }), ev(8, 'turn_start', { messageId: 7 })]
    assert.deepEqual(unstartedUserMessages(events), [])
  })

  test('ignores turn_start without a numeric messageId', () => {
    const events = [ev(1, 'user_message', { text: 'a' }), ev(2, 'turn_start', {})]
    assert.deepEqual(
      unstartedUserMessages(events).map(e => e.id),
      [1],
    )
  })

  test('startedMessageIds collects only numeric messageIds', () => {
    const ids = startedMessageIds([
      ev(2, 'turn_start', { messageId: 1 }),
      ev(3, 'turn_start', { messageId: 'nope' }),
      ev(4, 'turn_start', null),
    ])
    assert.deepEqual([...ids], [1])
  })
})
