import type { Id } from '@baton/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { StatusBadge } from '../../components/status-badge'
import { type RenderItem, reduceEvents, type TurnEndSummary } from './event-render'
import { useSessionStream } from './use-session-stream'
import { useSession, useSessions } from './use-sessions'

type SessionDetailProps = { projectId: Id; sessionId: Id }

// Render a Session as a chat. Looks up the session by int id; the list query
// from `useSessions` re-polls so we can use its fresher copy when available.
export const SessionDetail = ({ projectId, sessionId }: SessionDetailProps) => {
  const api = useApi()
  const { data: sessionShallow } = useSession(sessionId)
  const { data: liveSessions } = useSessions(projectId)
  const session = liveSessions?.find(s => s.id === sessionId) ?? sessionShallow
  const { events, status } = useSessionStream(session?.id ?? null)
  const items = useMemo(() => reduceEvents(events), [events])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Auto-scroll the event list to the bottom whenever new items arrive.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: items.length is the intended trigger
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [items.length])

  if (!session) return <div className="p-6 text-sm text-gray-400">loading…</div>

  const send = async () => {
    const text = draft.trim()
    if (!text || !session) return
    setSending(true)
    try {
      await api.sessions.sendMessage(session.id, text)
      setDraft('')
    } finally {
      setSending(false)
    }
  }
  // `alive` / `busy` only come on view-merged responses; bare records (like
  // the cached useSession one) don't carry them. Treat closedAt as the only
  // hard "no chat" signal.
  const view = session as typeof session & { alive?: boolean; busy?: boolean }
  const disabled = !!session.closedAt
  const badgeStatus: 'idle' | 'busy' | 'closed' | 'offline' = session.closedAt
    ? 'closed'
    : view.alive === false
      ? 'offline'
      : view.busy
        ? 'busy'
        : 'idle'

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-gray-200 p-6">
        <div className="flex items-center gap-1.5 text-xs tracking-wider text-gray-500 uppercase">
          <span>Session</span>
          <span aria-hidden="true" className="text-gray-300">
            ·
          </span>
          <span className="font-mono normal-case tracking-normal text-gray-400">#{session.id}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">{session.name}</h2>
          <StatusBadge status={badgeStatus} />
          <span className="text-xs text-gray-400">stream: {status}</span>
        </div>
        {session.worktreePath && (
          <p className="font-mono text-xs text-gray-500">cwd: {session.worktreePath}</p>
        )}
        {session.claudeSessionId && (
          <p className="font-mono text-xs text-gray-500">
            claude session: {session.claudeSessionId}
          </p>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-50 px-4 py-4">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">no events yet — say something below.</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {items.map(item => (
              <RenderItemView key={item.key} item={item} />
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-gray-200 bg-white p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
            disabled={disabled}
            placeholder={disabled ? 'session closed' : 'Message (⌘/Ctrl-Enter to send)'}
            className="min-h-[44px] flex-1 resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
            rows={2}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={disabled || sending || draft.trim().length === 0}
            className="rounded-md border border-blue-500 bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// === per-item render components ============================================

const RenderItemView = ({ item }: { item: RenderItem }) => {
  if (item.kind === 'system-header')
    return <SystemHeader model={item.model} sessionId={item.sessionId} />
  if (item.kind === 'user-bubble') return <UserBubble text={item.text} />
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
  return <RawBlock payload={item.payload} />
}

const SystemHeader = ({ model, sessionId }: { model?: string; sessionId?: string }) => (
  <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 font-mono">
      {model ?? 'claude'}
    </span>
    {sessionId && <span className="font-mono">session {sessionId.slice(0, 8)}</span>}
  </div>
)

const UserBubble = ({ text }: { text: string }) => (
  <div className="flex justify-end">
    <div className="max-w-prose rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm whitespace-pre-wrap text-gray-900">
      {text}
    </div>
  </div>
)

const AssistantBubble = ({ text }: { text: string }) => (
  <div className="flex justify-start">
    <div className="max-w-prose rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm whitespace-pre-wrap text-gray-800 shadow-sm">
      {text}
    </div>
  </div>
)

const inputSummary = (input: unknown): string => {
  if (input == null) return ''
  if (typeof input === 'string') return input.length > 80 ? `${input.slice(0, 80)}…` : input
  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>)
    if (entries.length === 0) return ''
    const [k, v] = entries[0] as [string, unknown]
    const vs = typeof v === 'string' ? v : JSON.stringify(v)
    const head = `${k}: ${vs}`
    return head.length > 80 ? `${head.slice(0, 80)}…` : head
  }
  return String(input)
}

const ToolBlock = ({
  name,
  input,
  resultText,
  isError,
}: {
  name: string
  input: unknown
  resultText?: string
  isError?: boolean
}) => {
  const [open, setOpen] = useState(false)
  const summary = inputSummary(input)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 self-start rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left font-mono text-xs text-gray-700 hover:bg-gray-50"
      >
        <span aria-hidden="true" className="text-gray-400">
          {open ? '▾' : '▸'}
        </span>
        <span className="font-semibold text-gray-800">{name}</span>
        {summary && <span className="truncate text-gray-500">{summary}</span>}
        {isError && (
          <span className="rounded bg-red-50 px-1 text-[10px] text-red-700 ring-1 ring-inset ring-red-200/60">
            error
          </span>
        )}
      </button>
      {open && (
        <div className="ml-4 flex flex-col gap-1">
          <pre className="overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2 font-mono text-xs whitespace-pre-wrap break-words text-gray-700">
            {JSON.stringify(input, null, 2)}
          </pre>
          {resultText !== undefined && (
            <pre
              className={`overflow-x-auto rounded border p-2 font-mono text-xs whitespace-pre-wrap break-words ${
                isError
                  ? 'border-red-200 bg-red-50/50 text-red-800'
                  : 'border-gray-100 bg-white text-gray-700'
              }`}
            >
              {resultText}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

const TurnEnd = ({ result }: { result?: TurnEndSummary }) => (
  <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
    <span>turn done</span>
    {result?.numTurns !== undefined && <span>· {result.numTurns} turn(s)</span>}
    {result?.totalCostUsd !== undefined && <span>· ${result.totalCostUsd.toFixed(4)}</span>}
    {result?.subtype && result.subtype !== 'success' && (
      <span className="text-red-600">· {result.subtype}</span>
    )}
  </div>
)

const TurnErrorRow = ({ message }: { message: string }) => (
  <div className="flex justify-center">
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
      turn error: {message}
    </div>
  </div>
)

const RawBlock = ({ payload }: { payload: unknown }) => (
  <pre className="overflow-x-auto rounded border border-gray-100 bg-white p-2 font-mono text-[11px] whitespace-pre-wrap break-words text-gray-500">
    {JSON.stringify(payload, null, 2)}
  </pre>
)
