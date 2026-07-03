import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentItem } from '@baton/shared'
import type { WorkerClient } from '../../client.ts'

export type TurnResult = { subtype: string; isError: boolean; resultText: string }

export const streamAgentEvents = async (
  events: AsyncIterable<AgentEvent>,
  worker: WorkerClient,
): Promise<TurnResult | null> => {
  let result: TurnResult | null = null
  for await (const event of events) {
    await worker.emitEvent('agent_event', event)
    if (event.type === 'turn.completed') {
      result = {
        subtype: event.subtype ?? 'success',
        isError: false,
        resultText: '',
      }
    } else if (event.type === 'turn.failed') {
      result = {
        subtype: event.error.subtype ?? 'error',
        isError: true,
        resultText: event.error.message,
      }
    }
  }
  return result
}

export const streamClaudeSdkEvents = (
  messages: AsyncIterable<SDKMessage>,
  worker: WorkerClient,
): Promise<TurnResult | null> => streamAgentEvents(claudeToAgentEvents(messages), worker)

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const messageContent = (payload: Record<string, unknown>): Record<string, unknown>[] => {
  const msg = payload.message
  if (!isRecord(msg) || !Array.isArray(msg.content)) return []
  return msg.content.filter(isRecord)
}

const textFromToolResult = (raw: Record<string, unknown>): string => {
  const c = raw.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map(b => (isRecord(b) && typeof b.text === 'string' ? b.text : JSON.stringify(b)))
      .join('\n')
  }
  return JSON.stringify(c ?? '')
}

const commandOf = (input: unknown): string => {
  if (!isRecord(input)) return ''
  return str(input.command) ?? str(input.cmd) ?? ''
}

const pathOf = (input: unknown): string | undefined => {
  if (!isRecord(input)) return undefined
  return str(input.file_path) ?? str(input.path)
}

const fileKindOf = (name: string): 'add' | 'update' | 'delete' =>
  name === 'Delete' ? 'delete' : 'update'

const todoItems = (input: unknown): Array<{ text: string; completed: boolean }> => {
  if (!isRecord(input) || !Array.isArray(input.todos)) return []
  return input.todos.filter(isRecord).map(todo => ({
    text: str(todo.content) ?? str(todo.text) ?? '',
    completed: todo.status === 'completed' || todo.completed === true,
  }))
}

const mcpParts = (name: string): { server: string; tool: string } | null => {
  const match = /^mcp__(.+?)__(.+)$/.exec(name)
  return match ? { server: match[1] ?? '', tool: match[2] ?? '' } : null
}

const startedItemFromToolUse = (block: Record<string, unknown>): AgentItem => {
  const id = str(block.id) ?? `tool-${Math.random().toString(36).slice(2)}`
  const name = str(block.name) ?? 'tool'
  const input = block.input ?? null
  if (name === 'Bash') {
    return {
      type: 'command_execution',
      id,
      status: 'in_progress',
      command: commandOf(input),
      output: '',
    }
  }
  if (name === 'Edit' || name === 'Write' || name === 'MultiEdit' || name === 'Delete') {
    const path = pathOf(input)
    return {
      type: 'file_change',
      id,
      status: 'in_progress',
      changes: path ? [{ path, kind: fileKindOf(name) }] : [],
    }
  }
  const mcp = mcpParts(name)
  if (mcp) {
    return {
      type: 'mcp_tool_call',
      id,
      status: 'in_progress',
      server: mcp.server,
      tool: mcp.tool,
      arguments: input,
    }
  }
  if (name === 'WebSearch' || name === 'web_search') {
    return {
      type: 'web_search',
      id,
      status: 'in_progress',
      query: isRecord(input) ? (str(input.query) ?? '') : '',
    }
  }
  if (name === 'TodoWrite') {
    return { type: 'todo_list', id, status: 'in_progress', items: todoItems(input) }
  }
  return { type: 'tool_call', id, status: 'in_progress', name, input }
}

const completeItem = (item: AgentItem, output: string, isError: boolean): AgentItem => {
  if (item.type === 'command_execution')
    return { ...item, status: isError ? 'failed' : 'completed', output }
  if (item.type === 'mcp_tool_call')
    return { ...item, status: isError ? 'failed' : 'completed', output, isError }
  if (item.type === 'tool_call')
    return { ...item, status: isError ? 'failed' : 'completed', output, isError }
  return { ...item, status: isError ? 'failed' : 'completed' } as AgentItem
}

const resultEvent = (message: SDKMessage & { type: 'result' }): AgentEvent => {
  const rec = message as unknown as Record<string, unknown>
  const subtype = str(rec.subtype) ?? 'unknown'
  const isError = rec.is_error === true || subtype !== 'success'
  const resultText = str(rec.result) ?? ''
  const usage = {
    numTurns: typeof rec.num_turns === 'number' ? rec.num_turns : undefined,
    totalCostUsd: typeof rec.total_cost_usd === 'number' ? rec.total_cost_usd : undefined,
    durationMs: typeof rec.duration_ms === 'number' ? rec.duration_ms : undefined,
  }
  return isError
    ? {
        type: 'turn.failed',
        error: { message: resultText || `claude result: ${subtype}`, subtype },
        usage,
        raw: message,
      }
    : { type: 'turn.completed', subtype, usage, raw: message }
}

export async function* claudeToAgentEvents(
  messages: AsyncIterable<SDKMessage>,
): AsyncIterable<AgentEvent> {
  const pendingTools = new Map<string, AgentItem>()
  let systemEmitted = false
  let textSeq = 0
  let reasoningSeq = 0

  for await (const message of messages) {
    const p = message as unknown as Record<string, unknown>
    if (message.type === 'system') {
      if (!systemEmitted) {
        systemEmitted = true
        yield {
          type: 'thread.started',
          sessionId: str(p.session_id) ?? '',
          model: str(p.model) ?? (isRecord(p.model_info) ? str(p.model_info.id) : undefined),
          raw: message,
        }
        yield { type: 'turn.started', raw: message }
      }
      continue
    }

    if (message.type === 'assistant') {
      for (const block of messageContent(p)) {
        if (block.type === 'text' && typeof block.text === 'string') {
          yield {
            type: 'item.completed',
            item: {
              type: 'agent_message',
              id: `assistant-${++textSeq}`,
              status: 'completed',
              text: block.text,
            },
            raw: block,
          }
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
          const text = block.thinking.trim()
          if (text) {
            yield {
              type: 'item.completed',
              item: {
                type: 'reasoning',
                id: `reasoning-${++reasoningSeq}`,
                status: 'completed',
                text,
              },
              raw: block,
            }
          }
        } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
          const item = startedItemFromToolUse(block)
          pendingTools.set(item.id, item)
          yield { type: 'item.started', item, raw: block }
        } else if (block.type === 'tool_result') {
          const id = str(block.tool_use_id) ?? ''
          const item = pendingTools.get(id)
          if (item) {
            const completed = completeItem(item, textFromToolResult(block), block.is_error === true)
            pendingTools.set(id, completed)
            yield { type: 'item.completed', item: completed, raw: block }
          } else {
            yield { type: 'raw', raw: block }
          }
        } else {
          yield { type: 'raw', raw: block }
        }
      }
      continue
    }

    if (message.type === 'user') {
      for (const block of messageContent(p)) {
        if (block.type !== 'tool_result') continue
        const id = str(block.tool_use_id) ?? ''
        const item = pendingTools.get(id)
        if (!item) {
          yield { type: 'raw', raw: block }
          continue
        }
        const completed = completeItem(item, textFromToolResult(block), block.is_error === true)
        pendingTools.set(id, completed)
        yield { type: 'item.completed', item: completed, raw: block }
      }
      continue
    }

    if (message.type === 'result') {
      yield resultEvent(message)
      continue
    }

    yield { type: 'raw', raw: message }
  }
}
