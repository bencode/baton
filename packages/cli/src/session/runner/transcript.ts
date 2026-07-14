import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SessionEvent } from '@baton/shared'

// claude writes a session file on first `--session-id` invocation, at
// `~/.claude/projects/<flattened-cwd>/<agentSessionId>.jsonl`. We don't
// reproduce the cwd-flattening (it has edge cases); instead walk every project
// dir and match by file name. Cheap — a handful of dirs typically.
export const findTranscriptPath = (agentSessionId: string): string | null => {
  const root = join(homedir(), '.claude', 'projects')
  try {
    for (const dir of readdirSync(root)) {
      const candidate = join(root, dir, `${agentSessionId}.jsonl`)
      try {
        if (statSync(candidate).isFile()) return candidate
      } catch {
        // not a file / gone — keep looking
      }
    }
  } catch {
    // ~/.claude/projects missing — fresh machine
  }
  return null
}

export type FirstExchange = { userText: string; assistantText: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// Pull the human-readable text out of a transcript entry's message — handles a
// plain string content or an array of content blocks (text blocks only; skips
// tool_use / tool_result, which carry no title-worthy prose).
const textOf = (rec: Record<string, unknown>): string => {
  const message = rec.message
  const content = isRecord(message) ? message.content : rec.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content))
    return content
      .filter(isRecord)
      .filter(b => b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text as string)
      .join('\n')
      .trim()
  return ''
}

const roleOf = (rec: Record<string, unknown>): 'user' | 'assistant' | null =>
  rec.type === 'user' || rec.type === 'assistant' ? rec.type : null

// First user prompt + first assistant reply parsed from raw jsonl content — the
// context the worker summarises into a title. Either field may be '' (e.g. the
// assistant hasn't produced text yet); null when nothing usable is found. Pure
// (no I/O) so it's unit-testable without a transcript on disk.
export const parseFirstExchange = (content: string): FirstExchange | null => {
  let userText = ''
  let assistantText = ''
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(parsed)) continue
    const role = roleOf(parsed)
    if (!role) continue
    const text = textOf(parsed)
    if (!text) continue
    if (role === 'user' && !userText) userText = text
    else if (role === 'assistant' && !assistantText) assistantText = text
    if (userText && assistantText) break
  }
  return userText || assistantText ? { userText, assistantText } : null
}

export const parseFirstExchangeFromEvents = (events: SessionEvent[]): FirstExchange | null => {
  let userText = ''
  let assistantText = ''
  for (const ev of events) {
    if (ev.type === 'user_message' && !userText) {
      const payload = isRecord(ev.payload) ? ev.payload : null
      if (typeof payload?.text === 'string') userText = payload.text.trim()
    } else if (ev.type === 'sdk_event' && !assistantText) {
      const payload = isRecord(ev.payload) ? ev.payload : null
      if (payload?.type === 'assistant') assistantText = textOf(payload)
    }
    if (userText && assistantText) break
  }
  return userText || assistantText ? { userText, assistantText } : null
}

// Locate + read the session's transcript and parse its first exchange. null
// when the file is missing or unreadable.
export const readFirstExchange = (agentSessionId: string): FirstExchange | null => {
  const path = findTranscriptPath(agentSessionId)
  if (!path) return null
  try {
    return parseFirstExchange(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
