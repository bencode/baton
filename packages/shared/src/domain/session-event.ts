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

// A chat / SDK transcript event. Persisted server-side (SessionEvent table,
// per-session monotonic `sequence`); the web loads history from the server and
// tails new events live over SSE. A user_message with no matching turn_start is
// the authoritative pending queue (see unstartedUserMessages below).
//
// type discriminator (kept loose; payload shape is owned by the producer):
//   - user_message:  payload = { text: string; attachments?: Attachment[]; images?: string[];
//                    planMode?: boolean; model?: string; effort?: AgentEffort }
//                    (images is legacy base64; attachments is the canonical path;
//                    planMode=true → worker runs this turn read-only, SDK permissionMode:'plan';
//                    model/effort → the session's overrides, stamped per turn so a
//                    resumed turn honours what an interactive one would)
//   - turn_start:    payload = { messageId?: number }
//   - agent_event:   payload = provider-neutral AgentEvent (new canonical stream)
//   - sdk_event:     legacy payload = a parsed line from `claude --output-format stream-json`
//   - turn_heartbeat: payload = {} — periodic liveness ping while a turn runs, so
//                    the server can tell a live-but-quiet turn (long single tool
//                    call, no sdk_event) from an abandoned one. Non-rendering,
//                    non-boundary; only refreshes turn liveness.
//   - turn_complete: payload = { exitCode: number }
//   - turn_error:    payload = { message: string }
//   - system:        payload = arbitrary control metadata
export type SessionEventType =
  | 'user_message'
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
  // Kept on the type for wire compat — never set. Was the old 'daemon claimed
  // this user_message' handshake; queue state is now derived (see below).
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

// The authoritative pending queue: persisted user_messages with no matching
// turn_start yet, in sequence order. State is derived purely from the durable
// event log — never a transient in-memory queue — so both the web (renders the
// QUEUED zone) and the session runner (drains it on (re)connect) agree, and a
// missed live SSE delivery can't strand a message.
export const unstartedUserMessages = (events: readonly SessionEvent[]): SessionEvent[] => {
  const started = startedMessageIds(events)
  return events.filter(e => e.type === 'user_message' && !started.has(e.id))
}

// --- turn liveness -----------------------------------------------------------

// These events mark a turn's start / end; everything else (sdk_event,
// turn_heartbeat, system, …) leaves the open/closed state untouched.
export const opensTurn = (e: SessionEvent): boolean =>
  e.type === 'user_message' || e.type === 'turn_start'
export const closesTurn = (e: SessionEvent): boolean =>
  e.type === 'turn_complete' || e.type === 'turn_error'

// Is a turn currently open? Look at the last start-or-end event — if it opened a
// turn, that turn hasn't closed yet. findLast (not some) because order matters: a
// completed history is full of turn_start events. Shared by the web indicator,
// the runner's orphan reconcile, and the server's busy sweep so all three agree
// on "is there a dangling open turn".
export const isAgentWorking = (events: readonly SessionEvent[]): boolean => {
  const last = events.findLast(e => opensTurn(e) || closesTurn(e))
  return last ? opensTurn(last) : false
}
