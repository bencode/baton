import { useState } from 'react'
import type { RenderItem, TurnEndSummary } from '../event-render'
import { Markdown } from './markdown'
import { ToolBlock } from './tool-block'

export const RenderItemView = ({ item }: { item: RenderItem }) => {
  if (item.kind === 'system-header')
    return <SystemHeader model={item.model} sessionId={item.sessionId} />
  if (item.kind === 'user-bubble') return <UserBubble text={item.text} images={item.images} />
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
  if (item.kind === 'turn-end') return <TurnEnd result={item.result} />
  if (item.kind === 'turn-error') return <TurnErrorRow message={item.message} />
  if (item.kind === 'rate-limit')
    return (
      <RateLimitNotice
        rateLimitType={item.rateLimitType}
        status={item.status}
        resetsAt={item.resetsAt}
      />
    )
  if (item.kind === 'thinking') return <ThinkingBlock text={item.text} />
  return <RawBlock payload={item.payload} />
}

const SystemHeader = ({ model, sessionId }: { model?: string; sessionId?: string }) => (
  <div className="flex items-center gap-2 text-[11px] text-gray-400">
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 font-mono">
      {model ?? 'claude'}
    </span>
    {sessionId && <span className="font-mono">session {sessionId.slice(0, 8)}</span>}
  </div>
)

const UserBubble = ({ text, images }: { text: string; images?: string[] }) => (
  <div className="flex justify-end">
    <div className="flex max-w-prose flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm whitespace-pre-wrap text-gray-900">
      {text && <span>{text}</span>}
      {images?.map(src => (
        // biome-ignore lint/a11y/useAltText: pasted screenshot, no caption available
        <img
          key={src.slice(0, 64)}
          src={src}
          className="max-h-80 max-w-full rounded border border-blue-200"
        />
      ))}
    </div>
  </div>
)

const AssistantBubble = ({ text }: { text: string }) => (
  <div className="flex justify-start">
    <div className="max-w-4xl rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
      <Markdown text={text} />
    </div>
  </div>
)

const TurnEnd = ({ result }: { result?: TurnEndSummary }) => (
  <div className="flex items-center gap-2 text-[11px] text-gray-400">
    <span>turn done</span>
    {result?.numTurns !== undefined && <span>· {result.numTurns} turn(s)</span>}
    {result?.totalCostUsd !== undefined && <span>· ${result.totalCostUsd.toFixed(4)}</span>}
    {result?.subtype && result.subtype !== 'success' && (
      <span className="text-red-600">· {result.subtype}</span>
    )}
  </div>
)

const TurnErrorRow = ({ message }: { message: string }) => (
  <div className="flex">
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
      turn error: {message}
    </div>
  </div>
)

// Map common claude rate-limit window names to short forms; fall back to the
// raw `foo_bar` → `foo-bar` if unrecognized.
const formatLimitType = (t: string): string => {
  const map: Record<string, string> = { one_hour: '1h', five_hour: '5h', daily: '24h' }
  return map[t] ?? t.replace(/_/g, '-')
}

// resetsAt is unix-seconds. Future → relative ('resets in 2h 13m'); past →
// absolute local time ('reset at 18:30').
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

const RateLimitNotice = ({
  rateLimitType,
  status,
  resetsAt,
}: {
  rateLimitType?: string
  status?: string
  resetsAt?: number
}) => {
  const bad = status === 'rejected' || status === 'denied'
  return (
    <div className="flex items-center gap-2 text-[11px] text-gray-400">
      <span>rate limit</span>
      {rateLimitType && <span>· {formatLimitType(rateLimitType)}</span>}
      {status && <span className={bad ? 'text-red-600' : ''}>· {status}</span>}
      {resetsAt !== undefined && <span>· {formatResets(resetsAt)}</span>}
    </div>
  )
}

// Extended-thinking block — model's internal reasoning. Collapsed by default
// since it's typically long and supplementary to the actual answer. Click
// the header to read; the body renders as markdown so headings / lists /
// code show through. The opaque `signature` field is intentionally dropped
// upstream (in the reducer) so it can never accidentally leak.
const ThinkingBlock = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 self-start rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left font-mono text-xs text-gray-500 italic hover:bg-gray-50"
      >
        <span aria-hidden="true" className="text-gray-400 not-italic">
          {open ? '▾' : '▸'}
        </span>
        <span>thinking</span>
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
