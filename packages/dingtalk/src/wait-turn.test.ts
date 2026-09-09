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

  // The canonical stream since the codex adapter: no `result` event at all, the
  // answer only ever arrives as agent_message items. A bridge that misses these
  // replies with a bare link (the 0-chars regression).
  test('captures the last agent_message of an agent_event stream', async () => {
    const item = (id: string, text: string) => ({
      type: 'item.completed',
      item: { type: 'agent_message', id, status: 'completed', text },
    })
    const f = fetchOf([
      ev(6, 'turn_start', { messageId: 5 }),
      ev(7, 'agent_event', {
        type: 'item.completed',
        item: { type: 'reasoning', id: 'r1', status: 'completed', text: '先想想' },
      }),
      ev(8, 'agent_event', item('a1', '中间说明')),
      ev(9, 'agent_event', item('a2', '最终答案')),
      ev(10, 'agent_event', { type: 'turn.completed', subtype: 'success' }),
      ev(11, 'turn_complete', {}),
    ])
    const r = await waitForTurn('url', 5, 1000, f)
    assert.equal(r.outcome, 'complete')
    assert.equal(r.text, '最终答案')
  })
})

const scoped = (
  sequence: number,
  attemptId: number,
  type: SessionEvent['type'],
  payload: unknown,
) => ({ ...ev(sequence, type, payload), attemptId })
const answer = (text: string) => ({
  type: 'item.completed',
  item: { id: 'answer', type: 'agent_message', status: 'completed', text },
})
test('a merged batch replies only to its last replyExpected input; cancellation sends no answer', async () => {
  const events = [
    ev(1, 'user_message', { text: 'A\n\nB', inputIds: [10, 11], replyInputId: 11 }),
    scoped(2, 30, 'turn_start', { messageId: 1, turnId: 20, inputIds: [10, 11] }),
    scoped(3, 30, 'agent_event', answer('one answer')),
    scoped(4, 30, 'turn_complete', { turnId: 20 }),
  ]
  assert.deepEqual(await waitForTurn('http://server/stream', 10, 1000, fetchOf(events)), {
    outcome: 'coalesced',
    text: '',
  })
  assert.deepEqual(await waitForTurn('http://server/stream', 11, 1000, fetchOf(events)), {
    outcome: 'complete',
    text: 'one answer',
  })
  assert.deepEqual(
    await waitForTurn(
      'http://server/stream',
      12,
      1000,
      fetchOf([ev(5, 'queue_changed', { cancelledIds: [12] })]),
    ),
    { outcome: 'cancelled', text: '' },
  )
})

test('reconnect resumes after the cursor; retry resets output and ignores the old attempt', async () => {
  const first = [
    ev(1, 'user_message', { inputIds: [10], replyInputId: 10 }),
    scoped(2, 30, 'turn_start', { messageId: 1, turnId: 20, inputIds: [10] }),
    scoped(3, 30, 'agent_event', answer('stale answer')),
    scoped(4, 30, 'turn_error', { turnId: 20, retrying: true }),
  ]
  const urls: string[] = []
  const fetchImpl: FetchLike = async url => {
    urls.push(url)
    return fetchOf(
      urls.length === 1
        ? first
        : [
            ...first,
            scoped(5, 31, 'turn_start', { messageId: 1, turnId: 20, inputIds: [10] }),
            scoped(6, 30, 'agent_event', answer('late old output')),
            scoped(7, 31, 'turn_complete', { turnId: 20 }),
          ],
    )(url)
  }
  assert.deepEqual(await waitForTurn('http://server/stream?since=0', 10, 1000, fetchImpl), {
    outcome: 'complete',
    text: '',
  })
  assert.equal(new URL(urls[1] ?? '').searchParams.get('since'), '4')
})

test('stopping a recovering logical turn settles its waiter without reusing failed output', async () => {
  const events = [
    ev(1, 'user_message', { inputIds: [10], replyInputId: 10 }),
    scoped(2, 30, 'turn_start', { messageId: 1, turnId: 20, inputIds: [10] }),
    scoped(3, 30, 'agent_event', answer('stale answer')),
    scoped(4, 30, 'turn_error', { turnId: 20, retrying: true }),
    ev(5, 'turn_aborted', { turnId: 20 }),
  ]
  assert.deepEqual(await waitForTurn('http://server/stream', 10, 1000, fetchOf(events)), {
    outcome: 'error',
    text: '执行已停止',
  })
})

test('deadline closes a quiet stream even if fetch does not observe its abort signal', async () => {
  let cancelled = false
  const fetchImpl: FetchLike = async () =>
    new Response(
      new ReadableStream({
        cancel: () => {
          cancelled = true
        },
      }),
    )
  assert.deepEqual(await waitForTurn('http://server/stream', 10, 20, fetchImpl), {
    outcome: 'timeout',
    text: '',
  })
  assert.equal(cancelled, true)
})
