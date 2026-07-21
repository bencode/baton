import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { SessionEvent } from '@baton/shared'
import { parseFirstExchange, parseFirstExchangeFromEvents } from './transcript.ts'

const event = (sequence: number, type: SessionEvent['type'], payload: unknown): SessionEvent => ({
  id: sequence + 1,
  sessionId: 1,
  sequence,
  type,
  payload,
  createdAt: 0,
})

describe('parseFirstExchange', () => {
  test('takes first user (string content) + first assistant (text blocks); skips summary/tool noise', () => {
    const jsonl = [
      JSON.stringify({ type: 'summary', summary: 'ignored' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'redesign the header' } }),
      // assistant turn that is only a tool_use → no text, skipped
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read' }] },
      }),
      // tool_result comes back as a user entry → no text, skipped
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', content: 'bytes' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'On it — editing header.' }],
        },
      }),
    ].join('\n')
    assert.deepEqual(parseFirstExchange(jsonl), {
      userText: 'redesign the header',
      assistantText: 'On it — editing header.',
    })
  })

  test('tolerates malformed lines and returns null when nothing usable', () => {
    assert.equal(parseFirstExchange('not json\n{"type":"summary"}\n'), null)
    assert.equal(parseFirstExchange(''), null)
  })

  test('returns the user text alone when no assistant text yet', () => {
    const jsonl = JSON.stringify({ type: 'user', message: { content: 'just the ask' } })
    assert.deepEqual(parseFirstExchange(jsonl), { userText: 'just the ask', assistantText: '' })
  })
})

describe('parseFirstExchangeFromEvents', () => {
  test('reads the first canonical exchange and keeps the completed agent text', () => {
    assert.deepEqual(
      parseFirstExchangeFromEvents([
        event(0, 'user_message', { text: 'fix session ordering' }),
        event(1, 'turn_start', { messageId: 1 }),
        event(2, 'agent_event', {
          type: 'item.updated',
          item: { type: 'agent_message', id: 'answer', text: 'I will inspect' },
        }),
        event(3, 'agent_event', {
          type: 'item.completed',
          item: { type: 'agent_message', id: 'answer', text: 'I will inspect the event reducer.' },
        }),
        event(4, 'turn_complete', {}),
        event(5, 'user_message', { text: 'later topic' }),
        event(6, 'agent_event', {
          type: 'item.completed',
          item: { type: 'agent_message', id: 'answer', text: 'must not replace the first turn' },
        }),
      ]),
      {
        userText: 'fix session ordering',
        assistantText: 'I will inspect the event reducer.',
      },
    )
  })

  test('falls back to legacy assistant sdk events', () => {
    assert.deepEqual(
      parseFirstExchangeFromEvents([
        event(0, 'user_message', { text: 'fix session titles' }),
        event(1, 'sdk_event', {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'I will inspect the title flow.' }] },
        }),
        event(2, 'turn_complete', {}),
      ]),
      {
        userText: 'fix session titles',
        assistantText: 'I will inspect the title flow.',
      },
    )
  })
})
