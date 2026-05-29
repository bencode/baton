import type { Id, SessionEvent } from '@baton/shared'
import { useEffect, useState } from 'react'
import { API_BASE } from '../../api'
import { appendEvent, loadEvents } from './local-store'

// EventSource subscription to /api/sessions/:id/stream paired with an
// IndexedDB-backed local transcript.
//
// Server no longer persists events — there's no history replay. On mount we
// fill `events` from the browser's local store (whatever this browser has
// seen for this session before), then subscribe to the live stream and
// append every incoming event both to in-memory state and IndexedDB.
//
// Cross-tab semantics: each tab keeps its own state and both write to the
// shared IndexedDB. Late tabs will see whatever the earliest tab persisted
// the next time they mount; live updates are per-tab via SSE.
export type StreamState = {
  events: SessionEvent[]
  status: 'connecting' | 'open' | 'closed' | 'error'
}

export const useSessionStream = (sessionId: Id | null): StreamState => {
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [status, setStatus] = useState<StreamState['status']>('connecting')

  useEffect(() => {
    if (sessionId === null) {
      setEvents([])
      setStatus('closed')
      return
    }
    let cancelled = false
    setEvents([])
    setStatus('connecting')

    // Hydrate from local store first so the user sees yesterday's chat before
    // SSE opens. If IndexedDB is unavailable (private browsing on some
    // browsers, quota issues) we silently fall back to a live-only view.
    void loadEvents(sessionId)
      .then(local => {
        if (!cancelled) setEvents(local)
      })
      .catch(() => {})

    const es = new EventSource(`${API_BASE}/sessions/${sessionId}/stream`)
    es.onopen = () => setStatus('open')
    es.onmessage = e => {
      try {
        const parsed = JSON.parse(e.data) as SessionEvent
        setEvents(prev => {
          if (prev.some(p => p.sequence === parsed.sequence)) return prev
          return [...prev, parsed]
        })
        void appendEvent(sessionId, parsed).catch(() => {})
      } catch {
        // ignore malformed payloads
      }
    }
    es.onerror = () => setStatus('error')
    return () => {
      cancelled = true
      es.close()
      setStatus('closed')
    }
  }, [sessionId])

  return { events, status }
}
