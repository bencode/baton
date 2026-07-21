import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  agentMessageText,
  closesTurn,
  isAgentWorking,
  opensTurn,
  type SessionEvent,
  startedMessageIds,
  unstartedUserMessages,
} from './session-event.ts'

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

describe('agentMessageText', () => {
  const item = (type: string, extra: Record<string, unknown> = {}) => ({
    type: 'item.completed',
    item: { type, id: 'i1', status: 'completed', text: '答案', ...extra },
  })

  test('extracts agent_message text from every item frame', () => {
    for (const frame of ['item.started', 'item.updated', 'item.completed']) {
      assert.deepEqual(agentMessageText({ ...item('agent_message'), type: frame }), {
        id: 'i1',
        text: '答案',
      })
    }
  })

  test('ignores non-agent items, non-item events, and empty text', () => {
    assert.equal(agentMessageText(item('reasoning')), null)
    assert.equal(agentMessageText(item('command_execution')), null)
    assert.equal(agentMessageText({ type: 'turn.completed', subtype: 'success' }), null)
    assert.equal(agentMessageText(item('agent_message', { text: '  ' })), null)
    assert.equal(agentMessageText(item('agent_message', { id: 7 })), null)
    assert.equal(agentMessageText(null), null)
  })
})

describe('turn liveness predicates', () => {
  test('opensTurn / closesTurn classify only boundary events', () => {
    assert.equal(opensTurn(ev(1, 'user_message', {})), true)
    assert.equal(opensTurn(ev(2, 'turn_start', {})), true)
    assert.equal(closesTurn(ev(3, 'turn_complete', {})), true)
    assert.equal(closesTurn(ev(4, 'turn_error', { message: 'x' })), true)
    // non-boundary events leave the open/closed state untouched
    assert.equal(opensTurn(ev(5, 'sdk_event', {})), false)
    assert.equal(closesTurn(ev(5, 'sdk_event', {})), false)
    assert.equal(opensTurn(ev(6, 'turn_heartbeat', {})), false)
    assert.equal(closesTurn(ev(6, 'turn_heartbeat', {})), false)
    assert.equal(opensTurn(ev(7, 'agent_event', { type: 'turn.started' })), false)
    assert.equal(closesTurn(ev(7, 'agent_event', { type: 'turn.started' })), false)
  })

  test('isAgentWorking: a dangling turn_start is open; a trailing close is not', () => {
    assert.equal(isAgentWorking([]), false)
    assert.equal(isAgentWorking([ev(1, 'turn_start', { messageId: 1 })]), true)
    assert.equal(
      isAgentWorking([ev(1, 'turn_start', {}), ev(2, 'turn_error', { message: 'x' })]),
      false,
    )
    // sdk_event / turn_heartbeat after a turn_start don't close it
    assert.equal(
      isAgentWorking([
        ev(1, 'turn_start', {}),
        ev(2, 'sdk_event', {}),
        ev(3, 'turn_heartbeat', {}),
      ]),
      true,
    )
  })
})
