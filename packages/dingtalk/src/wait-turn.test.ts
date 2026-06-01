import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { SessionEvent } from '@baton/shared'
import { type FetchLike, waitForTurn } from './wait-turn.ts'

const ev = (seq: number, type: SessionEvent['type'], payload: unknown = null): SessionEvent => ({
  id: seq,
  sessionId: 1,
  sequence: seq,
  type,
  payload,
  createdAt: 0,
})

// Fake fetch returning an SSE body that emits each event as a `data:` frame then closes.
const fetchOf =
  (events: SessionEvent[]): FetchLike =>
  async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          const enc = new TextEncoder()
          for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
          c.close()
        },
      }),
    )

describe('waitForTurn', () => {
  test('resolves complete on the turn matching our messageId', async () => {
    const f = fetchOf([
      ev(5, 'user_message', {}),
      ev(6, 'turn_start', { messageId: 5 }),
      ev(7, 'turn_complete', { exitCode: 0 }),
    ])
    assert.equal((await waitForTurn('url', 5, 1000, f)).outcome, 'complete')
  })

  test('ignores other turns; correlates strictly by messageId', async () => {
    const f = fetchOf([
      ev(1, 'turn_start', { messageId: 99 }),
      ev(2, 'turn_error', {}), // a different message's turn — must NOT match
      ev(3, 'user_message', {}),
      ev(4, 'turn_start', { messageId: 3 }),
      ev(5, 'turn_complete', {}),
    ])
    assert.equal((await waitForTurn('url', 3, 1000, f)).outcome, 'complete')
  })

  test('resolves error when our turn errors', async () => {
    const f = fetchOf([ev(4, 'turn_start', { messageId: 3 }), ev(5, 'turn_error', {})])
    assert.equal((await waitForTurn('url', 3, 1000, f)).outcome, 'error')
  })

  test('timeout when no matching turn appears before the stream ends', async () => {
    const f = fetchOf([ev(1, 'turn_start', { messageId: 99 }), ev(2, 'turn_complete', {})])
    assert.equal((await waitForTurn('url', 3, 1000, f)).outcome, 'timeout')
  })

  test('captures the result event text as the answer', async () => {
    const f = fetchOf([
      ev(6, 'turn_start', { messageId: 5 }),
      ev(7, 'sdk_event', {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '草稿' }] },
      }),
      ev(8, 'sdk_event', { type: 'result', subtype: 'success', result: '最终答案' }),
      ev(9, 'turn_complete', {}),
    ])
    const r = await waitForTurn('url', 5, 1000, f)
    assert.equal(r.outcome, 'complete')
    assert.equal(r.text, '最终答案')
  })

  test('falls back to assistant text when no result event', async () => {
    const f = fetchOf([
      ev(6, 'turn_start', { messageId: 5 }),
      ev(7, 'sdk_event', {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '回答' }] },
      }),
      ev(8, 'turn_complete', {}),
    ])
    assert.equal((await waitForTurn('url', 5, 1000, f)).text, '回答')
  })
})
