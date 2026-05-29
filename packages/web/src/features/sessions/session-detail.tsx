import type { Id } from '@baton/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { reduceEvents } from './event-render'
import {
  Composer,
  deriveBadgeStatus,
  EventStream,
  SessionHeader,
} from './session-detail/parts'
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
    if (!text) return
    setSending(true)
    try {
      await api.sessions.sendMessage(session.id, text)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  const badgeStatus = deriveBadgeStatus(session as typeof session & { alive?: boolean; busy?: boolean })
  const disabled = !!session.closedAt

  return (
    <div className="flex h-full flex-col">
      <SessionHeader session={session} badgeStatus={badgeStatus} streamStatus={status} />
      <EventStream items={items} scrollRef={scrollRef} />
      <Composer
        draft={draft}
        setDraft={setDraft}
        sending={sending}
        disabled={disabled}
        onSend={() => void send()}
      />
    </div>
  )
}
