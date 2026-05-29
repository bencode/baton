import type { SessionEvent } from '@baton/shared'

// Minimal console renderer for streaming SSE events. Used by `baton send` to
// echo the daemon's reply. Lifts the salient bits out of Claude's stream-json
// payloads; everything else is silently skipped to keep the output focused on
// what the user actually wants to see.

type ContentBlock =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; name?: string; input?: unknown }
  | { type: 'tool_result'; content?: unknown; is_error?: boolean }
  | { type: string; [k: string]: unknown }

type AssistantPayload = {
  type: 'assistant'
  message?: { content?: ContentBlock[] | string }
}
type UserPayload = {
  type: 'user'
  message?: { content?: ContentBlock[] | string }
}
type ResultPayload = {
  type: 'result'
  subtype?: string
  num_turns?: number
  total_cost_usd?: number
}

const writeOut = (s: string): void => {
  process.stdout.write(s)
}
const writeLine = (s = ''): void => {
  process.stdout.write(`${s}\n`)
}

const previewJson = (v: unknown, max = 80): string => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > max ? `${s.slice(0, max)}…` : s
}

const renderAssistantBlocks = (blocks: ContentBlock[]): void => {
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') {
      writeOut(b.text)
    } else if (b.type === 'tool_use') {
      writeLine()
      writeLine(`[${b.name ?? 'tool'}] ${previewJson(b.input)}`)
    }
  }
}

const renderToolResult = (blocks: ContentBlock[]): void => {
  for (const b of blocks) {
    if (b.type === 'tool_result' && b.content !== undefined) {
      const text = Array.isArray(b.content)
        ? b.content.map(c => (typeof c === 'object' && c && 'text' in c ? (c as { text: string }).text : '')).join('')
        : typeof b.content === 'string'
          ? b.content
          : JSON.stringify(b.content)
      writeLine(`  → ${previewJson(text, 200)}`)
    }
  }
}

// Render one event to the console. Returns true if the turn is finished (caller
// should close its SSE subscription and exit).
export const renderEvent = (event: SessionEvent): { done: boolean; ok: boolean } => {
  if (event.type === 'turn_start') {
    return { done: false, ok: true }
  }
  if (event.type === 'sdk_event') {
    const p = event.payload as AssistantPayload | UserPayload | ResultPayload | null
    if (!p || typeof p !== 'object') return { done: false, ok: true }
    if (p.type === 'assistant') {
      const content = p.message?.content
      if (typeof content === 'string') writeOut(content)
      else if (Array.isArray(content)) renderAssistantBlocks(content)
    } else if (p.type === 'user') {
      const content = p.message?.content
      if (Array.isArray(content)) renderToolResult(content)
    } else if (p.type === 'result') {
      const turns = p.num_turns !== undefined ? ` · ${p.num_turns} turn(s)` : ''
      const cost = p.total_cost_usd !== undefined ? ` · $${p.total_cost_usd.toFixed(4)}` : ''
      const sub = p.subtype && p.subtype !== 'success' ? ` · ${p.subtype}` : ''
      writeLine()
      writeLine(`[turn done${turns}${cost}${sub}]`)
    }
    return { done: false, ok: true }
  }
  if (event.type === 'turn_complete') {
    const code = (event.payload as { exitCode?: number } | null)?.exitCode ?? 0
    if (code !== 0) writeLine(`[turn exited with code ${code}]`)
    return { done: true, ok: code === 0 }
  }
  if (event.type === 'turn_error') {
    const msg = (event.payload as { message?: string } | null)?.message ?? 'unknown error'
    writeLine()
    writeLine(`[turn error: ${msg}]`)
    return { done: true, ok: false }
  }
  return { done: false, ok: true }
}
