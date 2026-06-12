import type { SessionEvent } from '@baton/shared'
import { reduceEvents } from '../sessions/event-render'

// Fold a session's recent transcript into compact terminal-style lines for a
// mission-control card body: one tinted single-truncated-line per render item,
// newest last. Pure — the card just prints them bottom-anchored.
export type PreviewTone = 'user' | 'tool' | 'text' | 'notice' | 'error'
export type PreviewLine = { tone: PreviewTone; text: string }

const MAX_LINES = 30

const clip = (s: string, n = 200): string => {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > n ? `${flat.slice(0, n)}…` : flat
}

export const eventsToPreview = (events: SessionEvent[]): PreviewLine[] => {
  const lines: PreviewLine[] = []
  for (const item of reduceEvents(events)) {
    if (item.kind === 'user-bubble' && item.text)
      lines.push({ tone: 'user', text: `you› ${clip(item.text)}` })
    else if (item.kind === 'assistant-text') lines.push({ tone: 'text', text: clip(item.text) })
    else if (item.kind === 'thinking')
      lines.push({ tone: 'notice', text: `· ${clip(item.text, 120)}` })
    else if (item.kind === 'tool-block')
      lines.push({
        tone: 'tool',
        text: `► ${item.name} ${clip(JSON.stringify(item.input ?? ''), 140)}`,
      })
    else if (item.kind === 'system-notice') lines.push({ tone: 'notice', text: `— ${item.text}` })
    else if (item.kind === 'turn-error')
      lines.push({ tone: 'error', text: `✗ ${clip(item.message, 140)}` })
  }
  return lines.slice(-MAX_LINES)
}
