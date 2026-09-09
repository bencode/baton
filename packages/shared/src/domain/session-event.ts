import type { Id } from './ids.ts'

export type ItemStatus = 'in_progress' | 'completed' | 'failed'

type BaseAgentItem = {
  id: string
  status: ItemStatus
}

export type AgentMessageItem = BaseAgentItem & {
  type: 'agent_message'
  text: string
}

export type ReasoningItem = BaseAgentItem & {
  type: 'reasoning'
  text: string
}

export type ToolCallItem = BaseAgentItem & {
  type: 'tool_call'
  name: string
  input: unknown
  output?: unknown
  isError?: boolean
}

export type CommandExecutionItem = BaseAgentItem & {
  type: 'command_execution'
  command: string
  output: string
  exitCode?: number
}

export type FileChangeItem = BaseAgentItem & {
  type: 'file_change'
  changes: Array<{ path: string; kind: 'add' | 'update' | 'delete' }>
}

export type McpToolCallItem = BaseAgentItem & {
  type: 'mcp_tool_call'
  server: string
  tool: string
  arguments: unknown
  output?: unknown
  isError?: boolean
}

export type WebSearchItem = BaseAgentItem & {
  type: 'web_search'
  query: string
}

export type TodoListItem = BaseAgentItem & {
  type: 'todo_list'
  items: Array<{ text: string; completed: boolean }>
}

export type ErrorItem = BaseAgentItem & {
  type: 'error'
  message: string
}

export type AgentItem =
  | AgentMessageItem
  | ReasoningItem
  | ToolCallItem
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | TodoListItem
  | ErrorItem

export type AgentUsage = {
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  reasoningOutputTokens?: number
  totalCostUsd?: number
  durationMs?: number
  numTurns?: number
}

type WithRaw = { raw?: unknown }

export type AgentEvent =
  | (WithRaw & { type: 'thread.started'; sessionId: string; model?: string })
  | (WithRaw & { type: 'turn.started' })
  | (WithRaw & { type: 'item.started'; item: AgentItem })
  | (WithRaw & { type: 'item.updated'; item: AgentItem })
  | (WithRaw & { type: 'item.completed'; item: AgentItem })
  | (WithRaw & { type: 'turn.completed'; usage?: AgentUsage; subtype?: string })
  | (WithRaw & {
      type: 'turn.failed'
      error: { message: string; subtype?: string }
      usage?: AgentUsage
    })
  | (WithRaw & { type: 'error'; message: string })
  | { type: 'raw'; raw: unknown }

// The agent's prose out of an `agent_event` payload, or null for anything else
// (reasoning, tool calls, turn boundaries). Every consumer that wants "what did
// the agent say" reads item.* frames: item.updated/completed replace earlier
// frames of the same item, hence the id — keyed replacement, not concatenation.
// Shared because three consumers read it: the Feishu and DingTalk bridges (the
// text they relay back into the chat) and the CLI's auto-title seed.
export const agentMessageText = (payload: unknown): { id: string; text: string } | null => {
  if (typeof payload !== 'object' || payload === null) return null
  const event = payload as Record<string, unknown>
  if (!['item.started', 'item.updated', 'item.completed'].includes(String(event.type))) return null
  const item = event.item
  if (typeof item !== 'object' || item === null) return null
  const { type, id, text } = item as Record<string, unknown>
  if (type !== 'agent_message' || typeof id !== 'string' || typeof text !== 'string') return null
  const trimmed = text.trim()
  return trimmed ? { id, text: trimmed } : null
}

// Persisted transcript of actual activity. Queue lives in PendingInput; claim
// creates user_message (UserMessagePayload). Execution output carries attemptId.
// message_cancelled / turn_heartbeat remain readable for legacy history only.
export type SessionEventType =
  | 'user_message'
  | 'queue_changed'
  | 'turn_aborted'
  | 'message_cancelled'
  | 'turn_start'
  | 'agent_event'
  | 'sdk_event'
  | 'turn_heartbeat'
  | 'turn_complete'
  | 'turn_error'
  | 'system'

export type SessionEvent = {
  id: Id
  sessionId: Id
  sequence: number
  type: SessionEventType
  payload: unknown
  attemptId?: Id
  // Kept on the type for wire compat — never set. Was the old 'daemon claimed
  // this user_message' handshake; PendingInput is now the queue.
  processedAt?: number
  createdAt: number
}

// Ids of user_messages whose turn has started — turn_start carries the source
// message id in payload.messageId. A user_message absent here hasn't been
// picked up yet.
export const startedMessageIds = (events: readonly SessionEvent[]): Set<Id> => {
  const ids = new Set<Id>()
  for (const e of events) {
    if (e.type !== 'turn_start') continue
    const id = (e.payload as { messageId?: unknown } | null)?.messageId
    if (typeof id === 'number') ids.add(id)
  }
  return ids
}

export const cancelledMessageIds = (events: readonly SessionEvent[]): Set<Id> => {
  const ids = new Set<Id>()
  for (const e of events) {
    if (e.type !== 'message_cancelled') continue
    const id = (e.payload as { messageId?: unknown } | null)?.messageId
    if (typeof id === 'number') ids.add(id)
  }
  return ids
}

export const messageLoopId = (event: SessionEvent): Id | undefined => {
  if (event.type !== 'user_message') return undefined
  const id = (event.payload as { loopId?: unknown } | null)?.loopId
  return typeof id === 'number' ? id : undefined
}

// Starting or cancelling the latest beat must not revive its predecessors.
export const supersededLoopMessageIds = (events: readonly SessionEvent[]): Set<Id> => {
  const latest = new Map<Id, number>()
  events.forEach(event => {
    const loopId = messageLoopId(event)
    if (loopId !== undefined) latest.set(loopId, Math.max(latest.get(loopId) ?? -1, event.sequence))
  })
  return new Set(
    events
      .filter(event => {
        const loopId = messageLoopId(event)
        return loopId !== undefined && event.sequence !== latest.get(loopId)
      })
      .map(event => event.id),
  )
}

// Offline migration only: identify legacy submissions that never ran.
// New claimed messages have inputIds and never belong to this legacy queue.
export const unstartedUserMessages = (events: readonly SessionEvent[]): SessionEvent[] => {
  const started = startedMessageIds(events)
  const cancelled = cancelledMessageIds(events)
  const superseded = supersededLoopMessageIds(events)
  return events.filter(
    e =>
      e.type === 'user_message' &&
      !started.has(e.id) &&
      !cancelled.has(e.id) &&
      !superseded.has(e.id) &&
      !Array.isArray((e.payload as { inputIds?: unknown } | null)?.inputIds),
  )
}

// --- turn liveness -----------------------------------------------------------

// These events mark a turn's start / end; everything else (sdk_event,
// turn_heartbeat, system, …) leaves the open/closed state untouched.
export const opensTurn = (e: SessionEvent): boolean => e.type === 'turn_start'
export const closesTurn = (e: SessionEvent): boolean =>
  e.type === 'turn_complete' || e.type === 'turn_error' || e.type === 'turn_aborted'

// Legacy transcript-only predicate; live busy state comes from durable Attempts.
export const isAgentWorking = (events: readonly SessionEvent[]): boolean => {
  if (unstartedUserMessages(events).length > 0) return true
  const last = events.findLast(e => opensTurn(e) || closesTurn(e))
  return last ? opensTurn(last) : false
}
