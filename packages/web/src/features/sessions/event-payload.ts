// The loose payload-reading layer for the event reducer: small guards plus pure
// parsers that pull typed bits out of Claude stream-json payloads (whose shape
// evolves, so every read is defensive). Kept apart from event-render.ts so the
// reducer's control flow stays readable and these parsers are unit-testable.

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

type ContentBlock = Record<string, unknown> & { type?: string }

const asContentArray = (v: unknown): ContentBlock[] => {
  if (!Array.isArray(v)) return []
  return v.filter((b): b is ContentBlock => isRecord(b))
}

export const messageContent = (payload: Record<string, unknown>): ContentBlock[] => {
  const msg = payload.message
  if (!isRecord(msg)) return []
  return asContentArray(msg.content)
}

// Best-effort stringify of tool_result content (which can be a string or an
// array of content blocks). Keeps it short and readable.
export const formatToolResult = (raw: unknown): { text: string; isError: boolean } => {
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

// system-header model: prefer the flat `model`, fall back to nested model_info.id.
export const headerModel = (p: Record<string, unknown>): string | undefined =>
  str(p.model) ?? str(isRecord(p.model_info) ? p.model_info.id : undefined)

// Control-action system events (/clear, /abort, /plan, /model) render as centered
// notices. Returns the notice text, or null when the event isn't a known action
// (the reducer then falls back to a raw dump).
export const systemActionNotice = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null
  const action = payload.action
  if (action === 'context_cleared') return 'context cleared — fresh conversation'
  if (action === 'interrupt') return 'interrupted'
  if (action === 'plan_mode')
    return payload.planMode === true ? 'entered plan mode' : 'exited plan mode'
  if (action === 'model') {
    const m = str(payload.model)
    const e = str(payload.effort)
    if (!m) return 'model reset to default'
    return e ? `model → ${m} (${e})` : `model → ${m}`
  }
  // Interactive-terminal boundaries — mark the human-takeover window (those turns
  // bypass baton's event log, so this is what explains the transcript gap).
  if (action === 'terminal_open') return 'interactive terminal opened'
  if (action === 'terminal_close') return 'interactive terminal closed'
  return null
}

export const parseResult = (p: Record<string, unknown>): TurnEndSummary => ({
  subtype: str(p.subtype),
  numTurns: typeof p.num_turns === 'number' ? p.num_turns : undefined,
  totalCostUsd: typeof p.total_cost_usd === 'number' ? p.total_cost_usd : undefined,
  durationMs: typeof p.duration_ms === 'number' ? p.duration_ms : undefined,
})

export const parseRateLimit = (p: Record<string, unknown>): RateLimitInfo => {
  const info = isRecord(p.rate_limit_info) ? p.rate_limit_info : null
  return {
    rateLimitType: info ? str(info.rateLimitType) : undefined,
    status: info ? str(info.status) : undefined,
    resetsAt: info && typeof info.resetsAt === 'number' ? info.resetsAt : undefined,
  }
}
