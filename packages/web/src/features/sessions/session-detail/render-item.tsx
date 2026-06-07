import { type Attachment, labelAttachments } from '@baton/shared'
import { useState } from 'react'
import { attachmentSrc } from '../../../api'
import { Markdown } from '../../../components/markdown'
import type { RateLimitInfo, RenderItem, TurnEndSummary } from '../event-render'
import { FileChip, isImage } from './attachment-view'
import { Caret, ToolBlock } from './tool-block'

export const RenderItemView = ({ item }: { item: RenderItem }) => {
  if (item.kind === 'system-header')
    return <SystemHeader model={item.model} sessionId={item.sessionId} />
  if (item.kind === 'user-bubble')
    return <UserBubble text={item.text} images={item.images} attachments={item.attachments} />
  if (item.kind === 'assistant-text') return <AssistantBubble text={item.text} />
  if (item.kind === 'tool-block')
    return (
      <ToolBlock
        name={item.name}
        input={item.input}
        resultText={item.resultText}
        isError={item.isError}
      />
    )
  if (item.kind === 'turn-end')
    return (
      <TurnDivider
        variant="success"
        turnIndex={item.turnIndex}
        result={item.result}
        rateLimit={item.rateLimit}
      />
    )
  if (item.kind === 'turn-error')
    return (
      <TurnDivider
        variant="error"
        turnIndex={item.turnIndex}
        message={item.message}
        rateLimit={item.rateLimit}
      />
    )
  if (item.kind === 'thinking') return <ThinkingBlock text={item.text} />
  if (item.kind === 'system-notice') return <SystemNotice text={item.text} />
  return <RawBlock payload={item.payload} />
}

// Centered hairline notice for session-level events (e.g. /clear). Lighter than
// a turn divider — no capsule, just dimmed text between two faint rules.
const SystemNotice = ({ text }: { text: string }) => (
  <div className="my-4 flex items-center gap-3">
    <div className="h-px flex-1 bg-gray-100" />
    <span className="font-mono text-[11px] text-gray-400">🆕 {text}</span>
    <div className="h-px flex-1 bg-gray-100" />
  </div>
)

const SystemHeader = ({ model, sessionId }: { model?: string; sessionId?: string }) => (
  <div className="flex items-center gap-2 font-mono text-[11px] text-gray-400">
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5">
      {model ?? 'claude'}
    </span>
    {sessionId && <span>session {sessionId.slice(0, 8)}</span>}
  </div>
)

// Sent attachments echo the same {label} the user saw in the composer, so a
// "{image-1}" reference in the text lines up with the thumbnail below it.
const SentAttachments = ({ attachments }: { attachments: Attachment[] }) => {
  const labels = labelAttachments(attachments)
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((att, i) => {
        const label = labels[i] ?? ''
        return isImage(att) ? (
          <figure key={att.id} className="m-0">
            {/* biome-ignore lint/a11y/useAltText: uploaded image, filename is the closest caption */}
            <img
              src={attachmentSrc(att)}
              className="max-h-80 max-w-full rounded border border-gray-200"
            />
            <figcaption className="mt-0.5 font-mono text-[10px] text-gray-400">
              {`{${label}}`}
            </figcaption>
          </figure>
        ) : (
          <FileChip key={att.id} att={att} download label={label} />
        )
      })}
    </div>
  )
}

const UserBubble = ({
  text,
  images,
  attachments,
}: {
  text: string
  images?: string[]
  attachments?: Attachment[]
}) => (
  <div className="min-w-0 max-w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
    <span className="mr-2 font-mono text-xs text-blue-500 select-none">you›</span>
    <span className="text-sm break-words whitespace-pre-wrap text-gray-800">{text}</span>
    {images && images.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map(src => (
          // biome-ignore lint/a11y/useAltText: pasted screenshot, no caption available
          <img
            key={src.slice(0, 64)}
            src={src}
            className="max-h-80 max-w-full rounded border border-gray-200"
          />
        ))}
      </div>
    )}
    {attachments && attachments.length > 0 && <SentAttachments attachments={attachments} />}
  </div>
)

// The answer is the hero of the transcript: slightly larger, darker, looser
// than everything else, line length capped near 70ch for readability.
const AssistantBubble = ({ text }: { text: string }) => (
  <div className="max-w-[70ch] text-[15px] leading-relaxed text-gray-900">
    <Markdown text={text} />
  </div>
)

// Format helpers for the turn capsule. Kept module-local because they're only
// meaningful in this divider's vocabulary; no shared util warranted.
const formatLimitType = (t: string): string => {
  const map: Record<string, string> = { one_hour: '1h', five_hour: '5h', daily: '24h' }
  return map[t] ?? t.replace(/_/g, '-')
}

const formatResets = (resetsAtSec: number): string => {
  const now = Date.now() / 1000
  const delta = resetsAtSec - now
  if (delta <= 0) {
    const d = new Date(resetsAtSec * 1000)
    return `reset at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  const h = Math.floor(delta / 3600)
  const m = Math.floor((delta % 3600) / 60)
  return h > 0 ? `resets in ${h}h ${m}m` : `resets in ${m}m`
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

const formatRateLimit = (r: RateLimitInfo): string | null => {
  if (!r.rateLimitType && !r.status) return null
  const parts: string[] = []
  if (r.rateLimitType) parts.push(`${formatLimitType(r.rateLimitType)} ${r.status ?? ''}`.trim())
  else if (r.status) parts.push(r.status)
  if (r.resetsAt !== undefined) parts.push(formatResets(r.resetsAt))
  return parts.join(' · ')
}

type TurnDividerProps = {
  variant: 'success' | 'error'
  turnIndex: number
  result?: TurnEndSummary
  rateLimit?: RateLimitInfo
  message?: string
}

// Full-width hairline + centered capsule that closes a turn. Wraps `turn N`
// with whatever metadata is available: duration, cost, rate-limit hint, or
// (on error) the failure message. Replaces the old TurnEnd / TurnErrorRow /
// standalone RateLimitNotice — all three were conceptually "this turn ended,
// here's a summary".
const TurnDivider = ({ variant, turnIndex, result, rateLimit, message }: TurnDividerProps) => {
  const isError = variant === 'error'
  const rateBad = rateLimit?.status === 'rejected' || rateLimit?.status === 'denied'
  const rateText = rateLimit ? formatRateLimit(rateLimit) : null
  const parts: { text: string; tone?: 'red' }[] = []
  if (result?.durationMs !== undefined) parts.push({ text: formatDuration(result.durationMs) })
  if (result?.totalCostUsd !== undefined) parts.push({ text: `$${result.totalCostUsd.toFixed(4)}` })
  if (result?.subtype && result.subtype !== 'success')
    parts.push({ text: result.subtype, tone: 'red' })
  if (rateText) parts.push({ text: rateText, tone: rateBad ? 'red' : undefined })
  if (isError && message) parts.push({ text: message, tone: 'red' })

  const lineColor = isError ? 'bg-red-200' : 'bg-gray-200'
  const capsuleStyle = isError
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-gray-200 bg-white text-gray-500'
  return (
    <div className="my-6 flex items-center gap-3">
      <div className={`h-px flex-1 ${lineColor}`} />
      <div
        className={`inline-flex flex-wrap items-center justify-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] wrap-anywhere ${capsuleStyle}`}
      >
        <span>turn {turnIndex}</span>
        {parts.map(p => (
          <span key={p.text} className={p.tone === 'red' ? 'text-red-600' : ''}>
            · {p.text}
          </span>
        ))}
      </div>
      <div className={`h-px flex-1 ${lineColor}`} />
    </div>
  )
}

// Extended-thinking block — model's internal reasoning. Collapsed by default
// since it's typically long and supplementary to the actual answer. Click
// the header to read; the body renders as markdown so headings / lists /
// code show through. The opaque `signature` field is intentionally dropped
// upstream (in the reducer) so it can never accidentally leak.
// First non-empty line of the reasoning, clipped — gives the collapsed row
// enough scent to spot turning points ("now I see the problem…") at a glance.
export const thinkingPreview = (text: string, max = 60): string => {
  const line =
    text
      .split('\n')
      .find(l => l.trim() !== '')
      ?.trim() ?? ''
  return line.length > max ? `${line.slice(0, max)}…` : line
}

export const ThinkingBlock = ({ text, bare = false }: { text: string; bare?: boolean }) => {
  const [open, setOpen] = useState(false)
  const chrome = bare
    ? 'px-1 py-1'
    : 'rounded-md border border-gray-200 bg-white px-2 py-1.5 hover:bg-gray-50'
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 self-start text-left font-mono text-xs text-gray-500 italic ${chrome}`}
      >
        <span className="not-italic">
          <Caret open={open} />
        </span>
        <span>thinking</span>
        {!open && <span className="truncate text-gray-400">{thinkingPreview(text)}</span>}
      </button>
      {open && (
        <div className="ml-4 max-w-4xl rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm text-gray-600 italic">
          <Markdown text={text} />
        </div>
      )}
    </div>
  )
}

const RawBlock = ({ payload }: { payload: unknown }) => (
  <pre className="overflow-x-auto rounded border border-gray-100 bg-white p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-gray-500">
    {JSON.stringify(payload, null, 2)}
  </pre>
)
