import type { RenderItem } from '../event-render'

// Process-type items (tool calls + thinking) fold into activity groups so the
// transcript reads answer-first; everything else stays a plain item.
export type ProcessItem = Extract<RenderItem, { kind: 'tool-block' | 'thinking' }>

export type ActivityGroup = {
  kind: 'activity-group'
  key: string
  items: ProcessItem[]
  // True only for the trailing group of a still-running turn — it renders
  // expanded (supervision); historical groups collapse to a summary row.
  live: boolean
}

export type StreamItem = RenderItem | ActivityGroup

const isProcess = (item: RenderItem): item is ProcessItem =>
  item.kind === 'tool-block' || item.kind === 'thinking'

// Fold consecutive process items into groups; any other kind (assistant-text,
// user-bubble, turn-end, …) flushes — the assistant speaking up is the natural
// chunk boundary. Single items retain the same group shell when a turn ends,
// preserving disclosure state. Only the trailing group of a working session
// is live. Pure: component layer only, the reducer stays untouched.
export const groupRenderItems = (items: readonly RenderItem[], working: boolean): StreamItem[] => {
  const out: StreamItem[] = []
  let buffer: ProcessItem[] = []
  const flush = (live: boolean): void => {
    if (buffer.length === 0) return
    out.push({ kind: 'activity-group', key: `group-${buffer[0]?.key}`, items: buffer, live })
    buffer = []
  }
  for (const item of items) {
    if (isProcess(item)) buffer.push(item)
    else {
      flush(false)
      out.push(item)
    }
  }
  flush(working)
  return out
}

// Summary parts for a collapsed group: per-tool counts in first-seen order,
// thinking last, failures called out (collapsing must never swallow an error).
export const groupSummary = (
  g: ActivityGroup,
): { steps: number; parts: string[]; failed: number } => {
  const counts = new Map<string, number>()
  for (const item of g.items) {
    const label = item.kind === 'thinking' ? 'thinking' : item.name
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const thinking = counts.get('thinking')
  counts.delete('thinking')
  const parts = [...counts.entries()].map(([name, n]) => `${name} ${n} 项`)
  if (thinking !== undefined) parts.push(`思考 ${thinking} 项`)
  const failed = g.items.filter(
    i => i.kind === 'tool-block' && (i.isError || i.status === 'failed'),
  ).length
  return { steps: g.items.length, parts, failed }
}

export type NodeTone = 'running' | 'error' | 'neutral' | 'thinking'

export const nodeTone = (item: ProcessItem, live: boolean, statusKnown = true): NodeTone => {
  if (item.kind === 'thinking') return 'thinking'
  if (item.isError || item.status === 'failed') return 'error'
  if (live && statusKnown && item.status === 'in_progress') return 'running'
  return 'neutral'
}
