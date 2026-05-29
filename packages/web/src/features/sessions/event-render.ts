import type { SessionEvent } from '@baton/shared'

// Pure reducer turning baton SessionEvent[] (raw, sequence-ordered) into a
// list of RenderItems UI can dispatch over. Tries to read Claude stream-json
// payloads loosely (the SDK's shape evolves); unknown shapes fall through to
// a `raw` item so nothing is silently dropped.

export type RenderItem =
  | { kind: 'system-header'; model?: string; sessionId?: string; key: string }
  | { kind: 'user-bubble'; text: string; images?: string[]; key: string }
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
  | { kind: 'turn-end'; result?: TurnEndSummary; key: string }
  | { kind: 'turn-error'; message: string; key: string }
  | {
      kind: 'rate-limit'
      rateLimitType?: string
      status?: string
      resetsAt?: number
      key: string
    }
  | { kind: 'thinking'; text: string; key: string }
  | { kind: 'raw'; payload: unknown; key: string }

export type TurnEndSummary = {
  subtype?: string
  numTurns?: number
  totalCostUsd?: number
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

// --- reducer -----------------------------------------------------------------

export const reduceEvents = (events: SessionEvent[]): RenderItem[] => {
  const items: RenderItem[] = []
  const pendingTools = new Map<string, Extract<RenderItem, { kind: 'tool-block' }>>()
  let pendingResult: TurnEndSummary | undefined
  let systemEmitted = false

  for (const e of events) {
    const key = `${e.sessionId}-${e.sequence}`
    if (e.type === 'user_message') {
      const text = isRecord(e.payload) && typeof e.payload.text === 'string' ? e.payload.text : ''
      const images =
        isRecord(e.payload) && Array.isArray(e.payload.images)
          ? e.payload.images.filter((i): i is string => typeof i === 'string')
          : undefined
      items.push({ kind: 'user-bubble', text, images, key })
      continue
    }
    if (e.type === 'turn_start') continue
    if (e.type === 'turn_error') {
      const msg =
        isRecord(e.payload) && typeof e.payload.message === 'string' ? e.payload.message : 'error'
      items.push({ kind: 'turn-error', message: msg, key })
      continue
    }
    if (e.type === 'turn_complete') {
      items.push({ kind: 'turn-end', result: pendingResult, key })
      pendingResult = undefined
      continue
    }
    if (e.type === 'system') {
      items.push({ kind: 'raw', payload: e.payload, key })
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
        if (b.type === 'tool_use') {
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
        if (b.type === 'tool_result') {
          const id = str(b.tool_use_id)
          if (!id) continue
          const target = pendingTools.get(id)
          if (!target) continue
          const { text, isError } = formatToolResult(b)
          target.resultText = text
          target.isError = isError
        }
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
      }
      continue
    }

    if (t === 'rate_limit_event') {
      const info = isRecord(p.rate_limit_info) ? p.rate_limit_info : null
      items.push({
        kind: 'rate-limit',
        rateLimitType: info ? str(info.rateLimitType) : undefined,
        status: info ? str(info.status) : undefined,
        resetsAt: info && typeof info.resetsAt === 'number' ? info.resetsAt : undefined,
        key,
      })
      continue
    }

    // unknown sdk event type
    items.push({ kind: 'raw', payload: p, key })
  }

  return items
}
