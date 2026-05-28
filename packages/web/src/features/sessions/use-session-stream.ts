import type { Id, SessionEvent } from '@baton/shared'
import { useEffect, useState } from 'react'
import { API_BASE } from '../../api'

// EventSource subscription to /api/sessions/:id/stream. Server replays history
// first then pushes new events. Sequence is monotonic per session; we dedupe by
// sequence so reconnects (server keepalives, transient drops) don't double-add.
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
    setEvents([])
    setStatus('connecting')
    const es = new EventSource(`${API_BASE}/sessions/${sessionId}/stream`)
    es.onopen = () => setStatus('open')
    es.onmessage = e => {
      try {
        const parsed = JSON.parse(e.data) as SessionEvent
        setEvents(prev => {
          if (prev.some(p => p.sequence === parsed.sequence)) return prev
          return [...prev, parsed]
        })
      } catch {
        // ignore malformed payloads
      }
    }
    es.onerror = () => setStatus('error')
    return () => {
      es.close()
      setStatus('closed')
    }
  }, [sessionId])
  return { events, status }
}
