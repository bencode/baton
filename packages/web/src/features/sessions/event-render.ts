import {
  type AgentEvent,
  type AgentItem,
  type AgentKind,
  type Attachment,
  type SessionEvent,
  startedMessageIds,
  unstartedUserMessages,
} from '@baton/shared'
import type { RateLimitInfo, TurnEndSummary } from './event-payload'
import {
  formatToolResult,
  headerModel,
  isRecord,
  messageContent,
  parseRateLimit,
  parseResult,
  str,
  systemActionNotice,
} from './event-payload'

// Re-exported from the shared turn-liveness predicate so existing web callers
// (and this feature's tests) keep their import path. The session indicator now
// trusts the server's `busy` instead, but the predicate stays available here.
export { isAgentWorking } from '@baton/shared'
// The turn-capsule summary types live with their parsers; re-export so existing
// callers keep importing them from event-render.
export type { RateLimitInfo, TurnEndSummary }

// Pure reducer turning session events (sequence-ordered, each carrying a stable
// server `id`) into a list of RenderItems UI can dispatch over. Tries to read
// Claude stream-json payloads loosely (the SDK's shape evolves); unknown shapes
// fall through to a `raw` item so nothing is silently dropped.

export type RenderItem =
  | { kind: 'system-header'; model?: string; sessionId?: string; key: string }
  | {
      kind: 'user-bubble'
      text: string
      images?: string[]
      attachments?: Attachment[]
      key: string
    }
  | { kind: 'assistant-text'; text: string; key: string }
  | {
      kind: 'tool-block'
      name: string
      input: unknown
      toolUseId: string
      resultText?: string
      isError?: boolean
      key: string
    }
  | {
      kind: 'turn-end'
      turnIndex: number
      result?: TurnEndSummary
      rateLimit?: RateLimitInfo
      key: string
    }
  | {
      kind: 'turn-error'
      turnIndex: number
      message: string
      rateLimit?: RateLimitInfo
      key: string
    }
  | { kind: 'thinking'; text: string; key: string }
  | { kind: 'system-notice'; text: string; key: string }
  | { kind: 'raw'; payload: unknown; key: string }

export type ReduceEventsOptions = {
  agentKind?: AgentKind
}

const defaultHeaderModel = (agentKind?: AgentKind): string =>
  agentKind === 'codex' ? 'codex' : agentKind === 'claude-code' ? 'claude' : 'agent'

// --- queued (pending) messages ----------------------------------------------

// A user message sent while a turn is running sits in the worker's queue until
// its own turn starts. We surface those in a separate "queued" zone rather than
// inlining them into the transcript, where they'd misrepresent a processed turn.
export type QueuedMessage = {
  text: string
  images?: string[]
  attachments?: Attachment[]
  key: string
}

// Extract the renderable payload of a user_message event — shared by the inline
// transcript bubble and the queued zone so both read the envelope identically.
const userBubble = (e: SessionEvent): QueuedMessage => {
  const text = isRecord(e.payload) && typeof e.payload.text === 'string' ? e.payload.text : ''
  const images =
    isRecord(e.payload) && Array.isArray(e.payload.images)
      ? e.payload.images.filter((i): i is string => typeof i === 'string')
      : undefined
  const attachments =
    isRecord(e.payload) && Array.isArray(e.payload.attachments)
      ? (e.payload.attachments as Attachment[])
      : undefined
  return { text, images, attachments, key: String(e.id) }
}

// User messages still waiting in the queue (no turn_start yet), in send order.
// Derivation lives in @baton/shared (startedMessageIds / unstartedUserMessages)
// so the session runner drains the exact same authoritative queue — a message
// moves out of this zone the instant its turn_start arrives.
export const pendingMessages = (events: SessionEvent[]): QueuedMessage[] =>
  unstartedUserMessages(events).map(userBubble)

// --- reducer -----------------------------------------------------------------

export const reduceEvents = (
  events: SessionEvent[],
  options: ReduceEventsOptions = {},
): RenderItem[] => {
  const items: RenderItem[] = []
  // Queued messages render in their own zone (see pendingMessages); keep them
  // out of the transcript until their turn_start lands.
  const started = startedMessageIds(events)
  const pendingTools = new Map<string, Extract<RenderItem, { kind: 'tool-block' }>>()
  const pendingAgentItems = new Map<string, RenderItem>()
  // Fold a tool_result block back into its tool-block (by tool_use_id). Used in
  // both the assistant branch (server-tool results) and user branch (client).
  const applyToolResult = (b: Record<string, unknown>): void => {
    const target = pendingTools.get(str(b.tool_use_id) ?? '')
    if (!target) return
    const { text, isError } = formatToolResult(b)
    target.resultText = text
    target.isError = isError
  }
  let pendingResult: TurnEndSummary | undefined
  let pendingRateLimit: RateLimitInfo | undefined
  let turnIndex = 0
  let systemEmitted = false

  const isAgentItem = (value: unknown): value is AgentItem =>
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.status === 'string'

  const toolLikeFromAgentItem = (
    item: Exclude<AgentItem, { type: 'agent_message' | 'reasoning' | 'error' }>,
    key: string,
  ): Extract<RenderItem, { kind: 'tool-block' }> => {
    if (item.type === 'command_execution') {
      return {
        kind: 'tool-block',
        name: 'Bash',
        input: { command: item.command },
        toolUseId: item.id,
        resultText: item.output || undefined,
        isError: item.status === 'failed',
        key,
      }
    }
    if (item.type === 'mcp_tool_call') {
      return {
        kind: 'tool-block',
        name: `mcp__${item.server}__${item.tool}`,
        input: item.arguments,
        toolUseId: item.id,
        resultText: item.output === undefined ? undefined : JSON.stringify(item.output),
        isError: item.isError ?? item.status === 'failed',
        key,
      }
    }
    if (item.type === 'web_search') {
      return {
        kind: 'tool-block',
        name: 'WebSearch',
        input: { query: item.query },
        toolUseId: item.id,
        isError: item.status === 'failed',
        key,
      }
    }
    if (item.type === 'file_change') {
      return {
        kind: 'tool-block',
        name: 'file_change',
        input: item.changes,
        toolUseId: item.id,
        isError: item.status === 'failed',
        key,
      }
    }
    if (item.type === 'todo_list') {
      return {
        kind: 'tool-block',
        name: 'TodoWrite',
        input: item.items,
        toolUseId: item.id,
        isError: item.status === 'failed',
        key,
      }
    }
    return {
      kind: 'tool-block',
      name: item.name,
      input: item.input,
      toolUseId: item.id,
      resultText: item.output === undefined ? undefined : JSON.stringify(item.output),
      isError: item.isError ?? item.status === 'failed',
      key,
    }
  }

  const upsertAgentItem = (item: AgentItem, key: string): void => {
    const existing = pendingAgentItems.get(item.id)
    if (item.type === 'agent_message') {
      if (existing?.kind === 'assistant-text') existing.text = item.text
      else {
        const next: RenderItem = { kind: 'assistant-text', text: item.text, key }
        pendingAgentItems.set(item.id, next)
        items.push(next)
      }
      return
    }
    if (item.type === 'reasoning') {
      if (existing?.kind === 'thinking') existing.text = item.text
      else if (item.text.trim()) {
        const next: RenderItem = { kind: 'thinking', text: item.text, key }
        pendingAgentItems.set(item.id, next)
        items.push(next)
      }
      return
    }
    if (item.type === 'error') {
      const next: RenderItem = {
        kind: 'turn-error',
        turnIndex: turnIndex + 1,
        message: item.message,
        key,
      }
      pendingAgentItems.set(item.id, next)
      items.push(next)
      return
    }
    const next = toolLikeFromAgentItem(item, key)
    if (existing?.kind === 'tool-block') {
      existing.name = next.name
      existing.input = next.input
      existing.resultText = next.resultText
      existing.isError = next.isError
    } else {
      pendingAgentItems.set(item.id, next)
      items.push(next)
    }
  }

  const applyAgentEvent = (event: AgentEvent, key: string): void => {
    if (event.type === 'thread.started') {
      if (systemEmitted) return
      systemEmitted = true
      items.push({
        kind: 'system-header',
        model: event.model ?? defaultHeaderModel(options.agentKind),
        sessionId: event.sessionId,
        key,
      })
      return
    }
    if (event.type === 'turn.started') return
    if (
      event.type === 'item.started' ||
      event.type === 'item.updated' ||
      event.type === 'item.completed'
    ) {
      if (isAgentItem(event.item)) upsertAgentItem(event.item, `${key}-${event.item.id}`)
      else items.push({ kind: 'raw', payload: event.raw ?? event, key })
      return
    }
    if (event.type === 'turn.completed') {
      pendingResult = {
        subtype: event.subtype,
        numTurns: event.usage?.numTurns,
        totalCostUsd: event.usage?.totalCostUsd,
        durationMs: event.usage?.durationMs,
      }
      return
    }
    if (event.type === 'turn.failed') {
      pendingResult = {
        subtype: isRecord(event.error) ? (str(event.error.subtype) ?? 'error') : 'error',
      }
      return
    }
    if (event.type === 'error') {
      items.push({ kind: 'turn-error', turnIndex: turnIndex + 1, message: event.message, key })
      return
    }
    items.push({ kind: 'raw', payload: event.raw, key })
  }

  for (const e of events) {
    // Server `id` is a stable unique identity (events are persisted) — safe as
    // the per-item React key.
    const key = String(e.id)
    if (e.type === 'user_message') {
      // Not yet started → it's queued; pendingMessages() renders it elsewhere.
      if (!started.has(e.id)) continue
      const { text, images, attachments } = userBubble(e)
      items.push({ kind: 'user-bubble', text, images, attachments, key })
      continue
    }
    // Provider item ids only need to be stable within a turn. Claude's canonical
    // adapter restarts its local counters for every turn, and Codex may also reuse
    // ids, so carrying these maps across a turn boundary would update an earlier
    // reply in place instead of appending the new one at the current position.
    if (e.type === 'turn_start') {
      pendingAgentItems.clear()
      pendingTools.clear()
      continue
    }
    // turn_heartbeat is a liveness ping — it does not render.
    if (e.type === 'turn_heartbeat') continue
    if (e.type === 'turn_error') {
      const msg =
        isRecord(e.payload) && typeof e.payload.message === 'string' ? e.payload.message : 'error'
      turnIndex += 1
      items.push({
        kind: 'turn-error',
        turnIndex,
        message: msg,
        rateLimit: pendingRateLimit,
        key,
      })
      pendingResult = undefined
      pendingRateLimit = undefined
      continue
    }
    if (e.type === 'turn_complete') {
      turnIndex += 1
      items.push({
        kind: 'turn-end',
        turnIndex,
        result: pendingResult,
        rateLimit: pendingRateLimit,
        key,
      })
      pendingResult = undefined
      pendingRateLimit = undefined
      continue
    }
    if (e.type === 'system') {
      // /clear, /abort, /plan, /model surface as centered control notices; any
      // other system payload falls through to a raw dump.
      const notice = systemActionNotice(e.payload)
      items.push(
        notice
          ? { kind: 'system-notice', text: notice, key }
          : { kind: 'raw', payload: e.payload, key },
      )
      continue
    }
    if (e.type === 'agent_event') {
      if (isRecord(e.payload) && typeof e.payload.type === 'string')
        applyAgentEvent(e.payload as AgentEvent, key)
      else items.push({ kind: 'raw', payload: e.payload, key })
      continue
    }
    // e.type === 'sdk_event' below
    if (!isRecord(e.payload)) {
      items.push({ kind: 'raw', payload: e.payload, key })
      continue
    }
    const p = e.payload
    const t = str(p.type)

    if (t === 'system' && !systemEmitted) {
      systemEmitted = true
      items.push({
        kind: 'system-header',
        model: headerModel(p) ?? defaultHeaderModel(options.agentKind),
        sessionId: str(p.session_id),
        key,
      })
      continue
    }
    if (t === 'system') continue // suppress later system events

    if (t === 'assistant') {
      const blocks = messageContent(p)
      let textBuf = ''
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        if (!b) continue
        if (b.type === 'text' && typeof b.text === 'string') {
          textBuf += textBuf ? `\n${b.text}` : b.text
          continue
        }
        if (textBuf) {
          items.push({ kind: 'assistant-text', text: textBuf, key: `${key}-text-${i}` })
          textBuf = ''
        }
        // Client tool calls (`tool_use`) and model-side server tools
        // (`server_tool_use`, e.g. analyze_image / web_search) render the same:
        // a tool-block, never a raw JSON dump.
        if (b.type === 'tool_use' || b.type === 'server_tool_use') {
          const id = str(b.id) ?? `${key}-tool-${i}`
          const name = str(b.name) ?? 'tool'
          const item: Extract<RenderItem, { kind: 'tool-block' }> = {
            kind: 'tool-block',
            name,
            input: b.input ?? null,
            toolUseId: id,
            key: `${key}-tool-${i}`,
          }
          items.push(item)
          pendingTools.set(id, item)
        } else if (b.type === 'tool_result') {
          // Server-tool results arrive inside the assistant message (client-tool
          // results come in the user message — handled below). Pair either way.
          applyToolResult(b)
        } else if (b.type === 'thinking') {
          // Drop empty thinking frames (extended-thinking streams open with one);
          // signature is an opaque verification token — never surface it.
          const thoughtText = typeof b.thinking === 'string' ? b.thinking : ''
          if (thoughtText.trim().length > 0) {
            items.push({ kind: 'thinking', text: thoughtText, key: `${key}-think-${i}` })
          }
        } else {
          // unknown block types fall through to raw so nothing is silently lost
          items.push({ kind: 'raw', payload: b, key: `${key}-blk-${i}` })
        }
      }
      if (textBuf) items.push({ kind: 'assistant-text', text: textBuf, key: `${key}-text-end` })
      continue
    }

    if (t === 'user') {
      const blocks = messageContent(p)
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        if (!b) continue
        if (b.type === 'tool_result') applyToolResult(b)
        // user text inside sdk_event echoes our prompt or carries tool_results
        // we already render user_message envelopes; skip text here
      }
      continue
    }

    if (t === 'result') {
      pendingResult = parseResult(p)
      continue
    }

    if (t === 'rate_limit_event') {
      // Captured and folded into the next turn capsule, not rendered standalone.
      pendingRateLimit = parseRateLimit(p)
      continue
    }

    // unknown sdk event type
    items.push({ kind: 'raw', payload: p, key })
  }

  return items
}
