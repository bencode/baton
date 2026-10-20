import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { AgentEvent } from '@baton/shared'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { newPiTurnState, piToAgentEvents } from './pi.ts'

// Fixtures trimmed from a real pi 1.3.0 turn (zai-coding-cn/glm-5.3).
const usage = (input: number, output: number, cacheRead = 0, reasoning = 0, cost = 0.001) => ({
  input,
  output,
  cacheRead,
  cacheWrite: 0,
  reasoning,
  totalTokens: input + output + cacheRead,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
})

const assistant = (
  responseId: string,
  content: unknown[],
  extra: Record<string, unknown> = {},
): AgentSessionEvent =>
  ({
    type: 'message_end',
    message: {
      role: 'assistant',
      content,
      responseId,
      timestamp: 1,
      usage: usage(100, 10),
      stopReason: 'stop',
      ...extra,
    },
  }) as unknown as AgentSessionEvent

const event = (raw: Record<string, unknown>): AgentSessionEvent =>
  raw as unknown as AgentSessionEvent

const fold = (events: AgentSessionEvent[], now = 5_000): AgentEvent[] =>
  events.reduce<{ out: AgentEvent[]; state: ReturnType<typeof newPiTurnState> }>(
    (acc, e) => {
      const next = piToAgentEvents(e, acc.state, now)
      return { out: [...acc.out, ...next.events], state: next.state }
    },
    { out: [], state: newPiTurnState(1_000) },
  ).out

describe('piToAgentEvents', () => {
  test('maps a tool-using turn onto Baton items and sums usage', () => {
    const out = fold([
      assistant(
        'r1',
        [
          { type: 'thinking', thinking: 'list then edit' },
          { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls -a' } },
        ],
        { usage: usage(4699, 190, 0, 88, 0.0074), stopReason: 'toolUse' },
      ),
      event({
        type: 'tool_execution_start',
        toolCallId: 'c1',
        toolName: 'bash',
        args: { command: 'ls -a' },
      }),
      event({
        type: 'tool_execution_end',
        toolCallId: 'c1',
        toolName: 'bash',
        isError: false,
        result: {
          content: [{ type: 'text', text: '.\n..\n' }],
          structuredContent: { output: '.\n..\n', exit_code: 0 },
        },
      }),
      event({
        type: 'tool_execution_start',
        toolCallId: 'c2',
        toolName: 'edit',
        args: { path: 'note.txt', edits: [{ oldText: 'hi', newText: 'hello' }] },
      }),
      event({
        type: 'tool_execution_end',
        toolCallId: 'c2',
        toolName: 'edit',
        isError: false,
        result: { content: [{ type: 'text', text: 'Successfully replaced 1 block(s).' }] },
      }),
      event({
        type: 'tool_execution_start',
        toolCallId: 'c3',
        toolName: 'read',
        args: { path: 'note.txt' },
      }),
      event({
        type: 'tool_execution_end',
        toolCallId: 'c3',
        toolName: 'read',
        isError: false,
        result: { content: [{ type: 'text', text: 'hello' }] },
      }),
      event({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Do' } }),
      assistant('r2', [{ type: 'text', text: 'Done.' }], {
        usage: usage(29, 74, 4992, 0, 0.0016),
      }),
      event({ type: 'agent_end', messages: [] }),
      event({ type: 'agent_settled', aborted: false }),
    ])

    assert.deepEqual(out, [
      {
        type: 'item.completed',
        item: { type: 'reasoning', id: 'r1:0', status: 'completed', text: 'list then edit' },
      },
      {
        type: 'item.started',
        item: {
          type: 'command_execution',
          id: 'c1',
          status: 'in_progress',
          command: 'ls -a',
          output: '',
        },
      },
      {
        type: 'item.completed',
        item: {
          type: 'command_execution',
          id: 'c1',
          status: 'completed',
          command: 'ls -a',
          output: '.\n..\n',
          exitCode: 0,
        },
      },
      {
        type: 'item.started',
        item: {
          type: 'file_change',
          id: 'c2',
          status: 'in_progress',
          changes: [{ path: 'note.txt', kind: 'update' }],
        },
      },
      {
        type: 'item.completed',
        item: {
          type: 'file_change',
          id: 'c2',
          status: 'completed',
          changes: [{ path: 'note.txt', kind: 'update' }],
        },
      },
      {
        type: 'item.started',
        item: {
          type: 'tool_call',
          id: 'c3',
          status: 'in_progress',
          name: 'read',
          input: { path: 'note.txt' },
        },
      },
      {
        type: 'item.completed',
        item: {
          type: 'tool_call',
          id: 'c3',
          status: 'completed',
          name: 'read',
          input: { path: 'note.txt' },
          output: 'hello',
          isError: false,
        },
      },
      {
        type: 'item.completed',
        item: { type: 'agent_message', id: 'r2:0', status: 'completed', text: 'Done.' },
      },
      {
        type: 'turn.completed',
        usage: {
          inputTokens: 4728,
          cachedInputTokens: 4992,
          outputTokens: 264,
          reasoningOutputTokens: 88,
          totalCostUsd: 0.0074 + 0.0016,
          numTurns: 2,
          durationMs: 4_000,
        },
      },
    ])
  })

  test('a provider error does not throw: the turn settles as failed', () => {
    const out = fold([
      assistant('r1', [], {
        stopReason: 'error',
        errorMessage: '401: Authentication Fails',
        usage: usage(0, 0, 0, 0, 0),
      }),
      event({ type: 'agent_settled', aborted: false }),
    ])
    const last = out.at(-1)
    assert.equal(last?.type, 'turn.failed')
    assert.deepEqual(last?.type === 'turn.failed' ? last.error : null, {
      message: '401: Authentication Fails',
    })
  })

  test('an auto-retried error that then succeeds completes the turn', () => {
    const out = fold([
      assistant('r1', [], { stopReason: 'error', errorMessage: 'overloaded' }),
      assistant('r2', [{ type: 'text', text: 'ok' }]),
      event({ type: 'agent_settled', aborted: false }),
    ])
    assert.equal(out.at(-1)?.type, 'turn.completed')
  })

  test('a failed bash command is a failed item with its exit code', () => {
    const out = fold([
      event({
        type: 'tool_execution_start',
        toolCallId: 'c1',
        toolName: 'bash',
        args: { command: 'false' },
      }),
      event({
        type: 'tool_execution_end',
        toolCallId: 'c1',
        toolName: 'bash',
        isError: true,
        result: {
          content: [{ type: 'text', text: 'exit 1' }],
          structuredContent: { output: '', exit_code: 1 },
        },
      }),
    ])
    assert.deepEqual(out.at(-1), {
      type: 'item.completed',
      item: {
        type: 'command_execution',
        id: 'c1',
        status: 'failed',
        command: 'false',
        output: '',
        exitCode: 1,
      },
    })
  })
})
