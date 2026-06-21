import {
  type Attachment,
  type SessionEvent,
  startedMessageIds,
  unstartedUserMessages,
} from '@baton/shared'

// Re-exported from the shared turn-liveness predicate so existing web callers
// (and this feature's tests) keep their import path. The session indicator now
// trusts the server's `busy` instead, but the predicate stays available here.
export { isAgentWorking } from '@baton/shared'

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

export type TurnEndSummary = {
  subtype?: string
  numTurns?: number
  totalCostUsd?: number
  durationMs?: number
}

export type RateLimitInfo = {
  rateLimitType?: string
  status?: string
  resetsAt?: number
}

// --- loose type guards -------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

type ContentBlock = Record<string, unknown> & { type?: string }

const asContentArray = (v: unknown): ContentBlock[] => {
  if (!Array.isArray(v)) return []
  return v.filter((b): b is ContentBlock => isRecord(b))
}

const messageContent = (payload: Record<string, unknown>): ContentBlock[] => {
  const msg = payload.message
  if (!isRecord(msg)) return []
  return asContentArray(msg.content)
}

// Best-effort stringify of tool_result content (which can be a string or an
// array of content blocks). Keeps it short and readable.
const formatToolResult = (raw: unknown): { text: string; isError: boolean } => {
  if (!isRecord(raw)) return { text: '', isError: false }
  const isError = raw.is_error === true
  const c = raw.content
  if (typeof c === 'string') return { text: c, isError }
  if (Array.isArray(c)) {
    const text = c
      .map(b => {
        if (isRecord(b) && typeof b.text === 'string') return b.text
        return JSON.stringify(b)
      })
      .join('\n')
    return { text, isError }
  }
  return { text: JSON.stringify(c ?? ''), isError }
}

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

export const reduceEvents = (events: SessionEvent[]): RenderItem[] => {
  const items: RenderItem[] = []
  // Queued messages render in their own zone (see pendingMessages); keep them
  // out of the transcript until their turn_start lands.
  const started = startedMessageIds(events)
  const pendingTools = new Map<string, Extract<RenderItem, { kind: 'tool-block' }>>()
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
    // turn_start opens a turn; turn_heartbeat is a liveness ping — neither renders.
    if (e.type === 'turn_start' || e.type === 'turn_heartbeat') continue
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
      // /clear and /abort mark control actions — centered notices, not raw.
      const action = isRecord(e.payload) ? e.payload.action : undefined
      if (action === 'context_cleared') {
        items.push({ kind: 'system-notice', text: 'context cleared — fresh conversation', key })
      } else if (action === 'interrupt') {
        items.push({ kind: 'system-notice', text: 'interrupted', key })
      } else if (action === 'plan_mode') {
        const on = isRecord(e.payload) && e.payload.planMode === true
        items.push({
          kind: 'system-notice',
          text: on ? 'entered plan mode' : 'exited plan mode',
          key,
        })
      } else if (action === 'model') {
        const m = isRecord(e.payload) ? str(e.payload.model) : undefined
        items.push({
          kind: 'system-notice',
          text: m ? `model → ${m}` : 'model reset to default',
          key,
        })
      } else {
        items.push({ kind: 'raw', payload: e.payload, key })
      }
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
        model:
          str(p.model) ??
          str((isRecord(p.model_info) && (p.model_info as Record<string, unknown>).id) as unknown),
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
      pendingResult = {
        subtype: str(p.subtype),
        numTurns: typeof p.num_turns === 'number' ? p.num_turns : undefined,
        totalCostUsd: typeof p.total_cost_usd === 'number' ? p.total_cost_usd : undefined,
        durationMs: typeof p.duration_ms === 'number' ? p.duration_ms : undefined,
      }
      continue
    }

    if (t === 'rate_limit_event') {
      // Captured and folded into the next turn capsule, not rendered standalone.
      const info = isRecord(p.rate_limit_info) ? p.rate_limit_info : null
      pendingRateLimit = {
        rateLimitType: info ? str(info.rateLimitType) : undefined,
        status: info ? str(info.status) : undefined,
        resetsAt: info && typeof info.resetsAt === 'number' ? info.resetsAt : undefined,
      }
      continue
    }

    // unknown sdk event type
    items.push({ kind: 'raw', payload: p, key })
  }

  return items
}
