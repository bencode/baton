import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseFirstExchange } from './transcript.ts'

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
