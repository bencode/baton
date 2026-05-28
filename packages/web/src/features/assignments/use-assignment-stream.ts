import type { AssignmentEvent, Id } from '@baton/shared'
import { useEffect, useState } from 'react'
import { API_BASE } from '../../api'

// EventSource subscription to /api/assignments/:id/stream. Server replays
// history first then pushes new events. Sequence is monotonic per assignment;
// we dedupe by sequence so reconnects (server-initiated) don't double-add.
export type StreamState = {
  events: AssignmentEvent[]
  status: 'connecting' | 'open' | 'closed' | 'error'
}

export const useAssignmentStream = (assignmentId: Id | null): StreamState => {
  const [events, setEvents] = useState<AssignmentEvent[]>([])
  const [status, setStatus] = useState<StreamState['status']>('connecting')

  useEffect(() => {
    if (assignmentId === null) {
      setEvents([])
      setStatus('closed')
      return
    }
    // Reset on assignment change.
    setEvents([])
    setStatus('connecting')
    const url = `${API_BASE}/assignments/${assignmentId}/stream`
    const es = new EventSource(url)
    es.onopen = () => setStatus('open')
    es.onmessage = e => {
      try {
        const parsed = JSON.parse(e.data) as AssignmentEvent
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
  }, [assignmentId])
  return { events, status }
}
