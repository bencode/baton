import type { RateLimitInfo, TurnEndSummary } from '../../event-render'

// Format helpers for the turn capsule. Kept module-local because they're only
// meaningful in this divider's vocabulary; no shared util warranted.
export const formatLimitType = (t: string): string => {
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

export const formatDuration = (ms: number): string => {
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

type TurnPart = { text: string; tone?: 'red' }

// Assemble the capsule's metadata chips from whatever the turn produced —
// duration, cost, a non-success subtype, a rate-limit hint, and (on error) the
// failure message. Pure so the assembly order/tones are testable without render.
export const turnSummaryParts = (
  variant: 'success' | 'error',
  result?: TurnEndSummary,
  rateLimit?: RateLimitInfo,
  message?: string,
): TurnPart[] => {
  const parts: TurnPart[] = []
  if (result?.durationMs !== undefined) parts.push({ text: formatDuration(result.durationMs) })
  if (result?.totalCostUsd !== undefined) parts.push({ text: `$${result.totalCostUsd.toFixed(4)}` })
  if (result?.subtype && result.subtype !== 'success')
    parts.push({ text: result.subtype, tone: 'red' })
  const rateBad = rateLimit?.status === 'rejected' || rateLimit?.status === 'denied'
  const rateText = rateLimit ? formatRateLimit(rateLimit) : null
  if (rateText) parts.push({ text: rateText, tone: rateBad ? 'red' : undefined })
  if (variant === 'error' && message) parts.push({ text: message, tone: 'red' })
  return parts
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
export const TurnDivider = ({
  variant,
  turnIndex,
  result,
  rateLimit,
  message,
}: TurnDividerProps) => {
  const isError = variant === 'error'
  const parts = turnSummaryParts(variant, result, rateLimit, message)
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
