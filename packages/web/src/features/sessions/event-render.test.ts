import type { SessionEvent, SessionEventType } from '@baton/shared'
import { describe, expect, test } from 'vitest'
import { isAgentWorking, pendingMessages, reduceEvents } from './event-render'

let seq = 0
const ev = (type: SessionEventType, payload: unknown): SessionEvent => ({
  id: ++seq,
  sessionId: 1,
  sequence: seq,
  type,
  payload,
  createdAt: 0,
})

describe('reduceEvents', () => {
  test('started user_message → user-bubble', () => {
    seq = 0
    const um = ev('user_message', { text: 'hello' })
    const out = reduceEvents([um, ev('turn_start', { messageId: um.id })])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'user-bubble', text: 'hello' })
  })

  test('user_message without its turn_start → queued, not inline; turn_start moves it inline', () => {
    seq = 0
    const um = ev('user_message', { text: 'queued one' })
    // No turn_start yet → out of the transcript, surfaced as queued instead.
    expect(reduceEvents([um])).toHaveLength(0)
    expect(pendingMessages([um])).toMatchObject([{ text: 'queued one' }])
    // Its turn_start arrives → inline in transcript, gone from the queue.
    const started = [um, ev('turn_start', { messageId: um.id })]
    expect(reduceEvents(started)[0]).toMatchObject({ kind: 'user-bubble', text: 'queued one' })
    expect(pendingMessages(started)).toHaveLength(0)
  })

  test('system context_cleared → system-notice (other system → raw)', () => {
    seq = 0
    const out = reduceEvents([
      ev('system', { action: 'context_cleared' }),
      ev('system', { action: 'something_else' }),
    ])
    expect(out[0]).toMatchObject({ kind: 'system-notice' })
    expect(out[1]).toMatchObject({ kind: 'raw' })
  })

  test('user_message carries attachments through to the bubble', () => {
    seq = 0
    const att = {
      id: 'a1',
      sessionId: 1,
      filename: 'shot.png',
      contentType: 'image/png',
      size: 7,
      url: '/sessions/1/attachments/a1',
      createdAt: 0,
    }
    const um = ev('user_message', { text: 'look', attachments: [att] })
    const out = reduceEvents([um, ev('turn_start', { messageId: um.id })])
    expect(out[0]).toMatchObject({ kind: 'user-bubble', text: 'look', attachments: [att] })
  })

  test('sdk_event system → one system-header; subsequent system events suppressed', () => {
    seq = 0
    const out = reduceEvents([
      ev('sdk_event', { type: 'system', model: 'claude-sonnet-4-6', session_id: 'abc' }),
      ev('sdk_event', { type: 'system', model: 'still-claude' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      kind: 'system-header',
      model: 'claude-sonnet-4-6',
      sessionId: 'abc',
    })
  })

  test('agent_event canonical stream renders system, assistant, tool, and result', () => {
    seq = 0
    const out = reduceEvents([
      ev('agent_event', { type: 'thread.started', sessionId: 'codex-thread', model: 'gpt-5' }),
      ev('agent_event', {
        type: 'item.completed',
        item: { type: 'agent_message', id: 'm1', status: 'completed', text: 'hi there' },
      }),
      ev('agent_event', {
        type: 'item.started',
        item: {
          type: 'command_execution',
          id: 'cmd1',
          status: 'in_progress',
          command: 'ls',
          output: '',
        },
      }),
      ev('agent_event', {
        type: 'item.completed',
        item: {
          type: 'command_execution',
          id: 'cmd1',
          status: 'completed',
          command: 'ls',
          output: 'README.md',
        },
      }),
      ev('agent_event', {
        type: 'turn.completed',
        subtype: 'success',
        usage: { totalCostUsd: 0.01 },
      }),
      ev('turn_complete', {}),
    ])
    expect(out).toHaveLength(4)
    expect(out[0]).toMatchObject({ kind: 'system-header', sessionId: 'codex-thread' })
    expect(out[1]).toMatchObject({ kind: 'assistant-text', text: 'hi there' })
    expect(out[2]).toMatchObject({
      kind: 'tool-block',
      name: 'Bash',
      resultText: 'README.md',
    })
    expect(out[3]).toMatchObject({
      kind: 'turn-end',
      result: { subtype: 'success', totalCostUsd: 0.01 },
    })
  })

  test('assistant text → assistant-text bubble', () => {
    seq = 0
    const out = reduceEvents([
      ev('sdk_event', {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hi there' }] },
      }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'assistant-text', text: 'hi there' })
  })

  test('assistant text + tool_use → text bubble followed by tool block without result', () => {
    seq = 0
    const out = reduceEvents([
      ev('sdk_event', {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'let me check' },
            { type: 'tool_use', id: 'tu_1', name: 'Bash', input: { cmd: 'ls' } },
          ],
        },
      }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ kind: 'assistant-text', text: 'let me check' })
    expect(out[1]).toMatchObject({ kind: 'tool-block', name: 'Bash', toolUseId: 'tu_1' })
    expect((out[1] as { resultText?: string }).resultText).toBeUndefined()
  })

  test('server_tool_use → tool-block; its in-assistant tool_result pairs (no raw dump)', () => {
    seq = 0
    const out = reduceEvents([
      ev('sdk_event', {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'server_tool_use',
              id: 'st_1',
              name: 'analyze_image',
              input: { imageSource: 'http://x/i.png', prompt: 'describe' },
            },
            {
              type: 'tool_result',
              tool_use_id: 'st_1',
              content: [{ type: 'text', text: 'a login page' }],
            },
          ],
        },
      }),
    ])
    expect(out.some(i => i.kind === 'raw')).toBe(false)
    expect(out[0]).toMatchObject({
      kind: 'tool-block',
      name: 'analyze_image',
      toolUseId: 'st_1',
      resultText: 'a login page',
    })
  })

  test('user tool_result is grafted onto the matching tool_use', () => {
    seq = 0
    const out = reduceEvents([
      ev('sdk_event', {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tu_2', name: 'Read', input: { path: 'README.md' } }],
        },
      }),
      ev('sdk_event', {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu_2',
              content: '# baton\nhello',
              is_error: false,
            },
          ],
        },
      }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      kind: 'tool-block',
      name: 'Read',
      resultText: '# baton\nhello',
      isError: false,
    })
  })

  test('result then turn_complete → one turn-end with summary', () => {
    seq = 0
    const out = reduceEvents([
      ev('sdk_event', {
        type: 'result',
        subtype: 'success',
        num_turns: 3,
        total_cost_usd: 0.0123,
      }),
      ev('turn_complete', { exitCode: 0 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      kind: 'turn-end',
      result: { subtype: 'success', numTurns: 3, totalCostUsd: 0.0123 },
    })
  })

  test('turn_error → turn-error item with message', () => {
    seq = 0
    const out = reduceEvents([ev('turn_error', { message: 'spawn failed' })])
    expect(out).toMatchObject([{ kind: 'turn-error', message: 'spawn failed' }])
  })

  test('unknown sdk event type → raw fallback', () => {
    seq = 0
    const out = reduceEvents([ev('sdk_event', { type: 'mystery_future_event', whatever: 1 })])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'raw' })
  })

  test('turn_start is silent (no render item emitted)', () => {
    seq = 0
    const out = reduceEvents([
      ev('user_message', { text: 'go' }),
      ev('turn_start', { messageId: 1 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'user-bubble' })
  })
})

describe('isAgentWorking', () => {
  test('empty history → not working', () => {
    seq = 0
    expect(isAgentWorking([])).toBe(false)
  })

  test('just-sent message (no turn_start yet) → working', () => {
    seq = 0
    expect(isAgentWorking([ev('user_message', { text: 'go' })])).toBe(true)
  })

  test('mid-stream (turn_start, sdk_event, no close) → working', () => {
    seq = 0
    expect(
      isAgentWorking([
        ev('user_message', { text: 'go' }),
        ev('turn_start', { messageId: 1 }),
        ev('sdk_event', { type: 'assistant', message: { content: [] } }),
      ]),
    ).toBe(true)
  })

  test('completed turn → not working', () => {
    seq = 0
    expect(
      isAgentWorking([
        ev('user_message', { text: 'go' }),
        ev('turn_start', { messageId: 1 }),
        ev('turn_complete', { exitCode: 0 }),
      ]),
    ).toBe(false)
  })

  test('errored turn → not working', () => {
    seq = 0
    expect(
      isAgentWorking([ev('turn_start', { messageId: 1 }), ev('turn_error', { message: 'x' })]),
    ).toBe(false)
  })

  test('new message after a completed turn → working again', () => {
    seq = 0
    expect(
      isAgentWorking([
        ev('user_message', { text: 'first' }),
        ev('turn_complete', { exitCode: 0 }),
        ev('user_message', { text: 'second' }),
      ]),
    ).toBe(true)
  })
})
