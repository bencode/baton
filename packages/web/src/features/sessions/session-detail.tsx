import type { Code, Id, SessionEvent } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import { StatusBadge } from '../../components/status-badge'
import { useSessionStream } from './use-session-stream'
import { useSessionByCode, useSessions } from './use-sessions'

type SessionDetailProps = { projectId: Id; code: Code }

// Chat panel: scrolling event log + a Send box. v0 rendering is structural;
// commit 3 polishes the event bubbles (assistant vs tool_use vs ...). For now
// each event is shown as `[seq] type payload` to prove the protocol.
export const SessionDetail = ({ projectId, code }: SessionDetailProps) => {
  const api = useApi()
  const { data: sessionShallow } = useSessionByCode(projectId, code)
  const { data: liveSessions } = useSessions(projectId)
  const session = liveSessions?.find(s => s.id === sessionShallow?.id) ?? sessionShallow
  const { events, status } = useSessionStream(session?.id ?? null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

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
  const disabled = session.state === 'closed'

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-gray-200 p-6">
        <div className="flex items-center gap-1.5 text-xs tracking-wider text-gray-500 uppercase">
          <span>Session</span>
          <span aria-hidden="true" className="text-gray-300">
            ·
          </span>
          <span className="font-mono normal-case tracking-normal text-gray-400">
            {session.code}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">{session.name}</h2>
          <StatusBadge status={session.state} />
          <span className="text-xs text-gray-400">stream: {status}</span>
        </div>
        {session.worktreePath && (
          <p className="font-mono text-xs text-gray-500">cwd: {session.worktreePath}</p>
        )}
        {session.claudeSessionId && (
          <p className="font-mono text-xs text-gray-500">
            claude session: {session.claudeSessionId}{' '}
            <span className="text-gray-400">
              (resume via `claude --resume {session.claudeSessionId}`)
            </span>
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 p-4">
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">no events yet — say something below.</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-xs text-gray-700">
            {events.map(e => (
              <EventRow key={e.sequence} event={e} />
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-gray-200 bg-white p-3">
        <div className="flex items-end gap-2">
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

const EventRow = ({ event }: { event: SessionEvent }) => {
  const payload = event.payload as { type?: string } | null
  const label = event.type === 'sdk_event' ? (payload?.type ?? 'sdk_event') : event.type
  return (
    <li className="flex items-start gap-2 rounded border border-gray-200 bg-white p-2">
      <span className="shrink-0 text-gray-400">#{event.sequence}</span>
      <span className="shrink-0 rounded bg-gray-100 px-1.5 text-gray-600">{label}</span>
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words text-gray-800">
        {JSON.stringify(event.payload, null, 2)}
      </pre>
    </li>
  )
}
