import type { Id, SessionEvent } from '@baton/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'

// The transcript is two sources folded into one ordered list: persisted history
// and the live tail (SSE `?live=1`). On open we load only a bounded WINDOW of the
// most recent events — long sessions reach multiple MB / thousands of nodes, and
// the user starts pinned to the bottom. Older events page in on demand via
// loadOlder; the live tail and reconnect-gap (`since`) backfill are unchanged.
const HISTORY_WINDOW = 200
// "Load earlier" pages a bigger block than the initial window: the window counts
// raw events, and a tool-heavy turn is dozens of sdk_events that fold into one
// activity group — so 200 events can be just a few message bubbles. A larger
// page means fewer clicks to walk back the conversation. Open stays lean (the
// user starts pinned to the bottom); only paging upward pulls the big block.
const OLDER_PAGE = 600

export type StreamState = {
  events: SessionEvent[]
  status: 'connecting' | 'open' | 'closed' | 'error'
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => void
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
  const [loadingOlder, setLoadingOlder] = useState(false)
  // Highest sequence seen (reconnect resume point) and lowest loaded (the
  // "load older" cursor). Refs so they're current without re-running effects.
  const lastSeqRef = useRef(0)
  const oldestSeqRef = useRef<number | null>(null)
  // The session this hook is currently bound to — guards an in-flight loadOlder
  // from merging a previous session's events after a fast switch.
  const boundSidRef = useRef<Id | null>(sessionId)
  const loadingOlderRef = useRef(false)

  // Merge a batch into the ordered list and track the seq bounds. Shared by the
  // stream effect (open / tail / reconnect) and loadOlder so both stay in sync.
  const apply = useCallback((incoming: SessionEvent[]) => {
    setEvents(prev => {
      const next = mergeEvents(prev, incoming)
      const first = next[0]
      const last = next[next.length - 1]
      if (last) lastSeqRef.current = last.sequence
      if (first) oldestSeqRef.current = first.sequence
      return next
    })
  }, [])

  // Page the WINDOW of events just before the current oldest (the contiguous
  // suffix grows upward). No-op at the start of the transcript or while loading.
  const loadOlder = useCallback(async () => {
    const before = oldestSeqRef.current
    if (sessionId === null || before === null || before <= 0 || loadingOlderRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const older = await api.sessions.listEvents(sessionId, { before, limit: OLDER_PAGE })
      if (boundSidRef.current === sessionId) apply(older)
    } catch (err) {
      console.error('[session-stream] load older failed', err)
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [sessionId, api, apply])

  useEffect(() => {
    boundSidRef.current = sessionId
    if (sessionId === null) {
      setEvents([])
      setStatus('closed')
      return
    }
    setEvents([])
    setStatus('connecting')
    lastSeqRef.current = 0
    oldestSeqRef.current = null
    let alive = true
    let opened = false
    let loaded = false // the initial window load has succeeded at least once
    const runBackfill = (load: Promise<SessionEvent[]>, onLoaded?: () => void) =>
      load
        .then(history => {
          if (!alive) return
          apply(history)
          onLoaded?.()
          // A failed backfill parks status on 'error'; a later success while the
          // tail is up means we're genuinely live again.
          if (es.readyState === EventSource.OPEN) setStatus('open')
        })
        .catch((err: unknown) => {
          if (!alive) return
          // A hole in the transcript — keep the "connection lost" banner rather
          // than lie with 'open'. The resume point didn't advance, so the next
          // reconnect retries the same gap.
          console.error('[session-stream] history backfill failed', err)
          setStatus('error')
        })
    // Initial open loads the recent window; reconnects pull only the gap since
    // the last seen sequence (or the window again if the initial load failed).
    const loadInitial = () =>
      runBackfill(api.sessions.listEvents(sessionId, { limit: HISTORY_WINDOW }), () => {
        loaded = true
      })
    const loadGap = () =>
      runBackfill(api.sessions.listEvents(sessionId, { since: lastSeqRef.current }))
    const es = new EventSource(api.sessionStreamUrl(sessionId))
    es.onopen = () => {
      setStatus('open')
      if (opened) loaded ? loadGap() : loadInitial()
      opened = true
    }
    es.onmessage = e => {
      try {
        apply([JSON.parse(e.data) as SessionEvent])
      } catch {
        // ignore malformed payloads
      }
    }
    es.onerror = () => setStatus('error')
    loadInitial()
    return () => {
      alive = false
      es.close()
      setStatus('closed')
    }
  }, [sessionId, api, apply])

  const first = events[0]
  const hasOlder = first !== undefined && first.sequence > 0
  return { events, status, hasOlder, loadingOlder, loadOlder }
}
