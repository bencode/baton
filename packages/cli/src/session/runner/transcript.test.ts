import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseFirstExchange, parseFirstExchangeFromEvents } from './transcript.ts'

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
  test('takes first user_message + first assistant sdk_event text', () => {
    assert.deepEqual(
      parseFirstExchangeFromEvents([
        {
          id: 1,
          sessionId: 1,
          sequence: 0,
          type: 'user_message',
          payload: { text: 'fix session titles' },
          createdAt: 0,
        },
        {
          id: 2,
          sessionId: 1,
          sequence: 1,
          type: 'sdk_event',
          payload: {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'I will inspect the title flow.' }] },
          },
          createdAt: 0,
        },
      ]),
      {
        userText: 'fix session titles',
        assistantText: 'I will inspect the title flow.',
      },
    )
  })
})
