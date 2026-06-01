import type { Id, SessionEvent } from '@baton/shared'
import { useEffect, useState } from 'react'
import { useApi } from '../../app/api-context'

// The transcript is two sources folded into one ordered list: the persisted
// history (one GET on open) and the live tail (SSE `?live=1`). Splitting them
// keeps open cheap — the old design replayed the whole log over SSE, one frame
// per event, so the browser re-rendered O(n) times → O(n²) on long sessions.
export type StreamState = {
  events: SessionEvent[]
  status: 'connecting' | 'open' | 'closed' | 'error'
}

// Dedupe by stable server `id`, order by per-session `sequence`. Pure → tested.
export const mergeEvents = (existing: SessionEvent[], incoming: SessionEvent[]): SessionEvent[] => {
  if (incoming.length === 0) return existing
  const byId = new Map<number, SessionEvent>()
  for (const e of existing) byId.set(e.id, e)
  for (const e of incoming) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence)
}

export const useSessionStream = (sessionId: Id | null): StreamState => {
  const api = useApi()
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
    let alive = true
    // Live tail first (so nothing created during the history fetch is missed —
    // the merge dedupes any overlap by id), then load history in one shot.
    const es = new EventSource(api.sessionStreamUrl(sessionId))
    es.onopen = () => setStatus('open')
    es.onmessage = e => {
      try {
        const ev = JSON.parse(e.data) as SessionEvent
        setEvents(prev => mergeEvents(prev, [ev]))
      } catch {
        // ignore malformed payloads
      }
    }
    es.onerror = () => setStatus('error')
    api.sessions
      .listEvents(sessionId)
      .then(history => alive && setEvents(prev => mergeEvents(prev, history)))
      .catch(() => {})
    return () => {
      alive = false
      es.close()
      setStatus('closed')
    }
  }, [sessionId, api])

  return { events, status }
}
