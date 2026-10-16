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

export type HistoryState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

export type StreamState = {
  connectionRevision: number
  events: SessionEvent[]
  status: 'connecting' | 'open' | 'closed' | 'error'
  hasOlder: boolean
  loadingOlder: boolean
  history: HistoryState
  retryHistory(): Promise<void>
  loadOlder: (beforePrepend?: () => void) => Promise<void>
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
  const [connectionRevision, setConnectionRevision] = useState(0)
  const [historyExhausted, setHistoryExhausted] = useState(false)
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [status, setStatus] = useState<StreamState['status']>('connecting')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [history, setHistory] = useState<HistoryState>({ status: 'loading' })
  const historyLoaded = useRef(false)
  const retry = useRef<(() => Promise<void>) | null>(null)
  const retryHistory = useCallback(async () => {
    await retry.current?.()
  }, [])
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
  const loadOlder = useCallback(
    async (beforePrepend?: () => void) => {
      const before = oldestSeqRef.current
      if (sessionId === null || before === null || before <= 0 || loadingOlderRef.current) return
      loadingOlderRef.current = true
      setLoadingOlder(true)
      try {
        const older = await api.sessions.listEvents(sessionId, { before, limit: OLDER_PAGE })
        if (boundSidRef.current === sessionId) {
          if (older.length > 0) beforePrepend?.()
          apply(older)
          if (older.length < OLDER_PAGE) setHistoryExhausted(true)
        }
      } catch (err) {
        console.error('[session-stream] load older failed', err)
      } finally {
        if (boundSidRef.current === sessionId) {
          loadingOlderRef.current = false
          setLoadingOlder(false)
        }
      }
    },
    [sessionId, api, apply],
  )

  useEffect(() => {
    const changed = boundSidRef.current !== sessionId
    boundSidRef.current = sessionId
    loadingOlderRef.current = false
    setLoadingOlder(false)
    if (changed || sessionId === null) {
      setEvents([])
      historyLoaded.current = false
      setHistory({ status: 'loading' })
      lastSeqRef.current = 0
      oldestSeqRef.current = null
      setHistoryExhausted(false)
    }
    if (sessionId === null) {
      setStatus('closed')
      return
    }
    setStatus('connecting')
    let alive = true
    let opened = false
    const loadHistory = async () => {
      if (!alive) return
      const initial = !historyLoaded.current
      setHistory({ status: initial ? 'loading' : 'ready' })
      try {
        const rows = await api.sessions.listEvents(
          sessionId,
          initial ? { limit: HISTORY_WINDOW } : { since: lastSeqRef.current },
        )
        if (!alive) return
        apply(rows)
        if (initial) setHistoryExhausted(rows.length < HISTORY_WINDOW)
        historyLoaded.current = true
        setHistory({ status: 'ready' })
      } catch (cause) {
        if (!alive) return
        console.error('[session-stream] history backfill failed', cause)
        setHistory({
          status: 'error',
          message: cause instanceof Error ? cause.message : String(cause),
        })
      }
    }
    retry.current = loadHistory
    // (Re)open the live tail. Every open wires its own handlers; the onopen of a
    // reopen (opened already true) backfills the gap missed while disconnected.
    const openStream = (): EventSource => {
      const stream = new EventSource(api.sessionStreamUrl(sessionId))
      stream.onopen = () => {
        if (!alive || stream !== es) return
        setConnectionRevision(value => value + 1)
        setStatus('open')
        if (opened) void loadHistory()
        opened = true
      }
      stream.onmessage = e => {
        if (!alive || stream !== es) return
        try {
          apply([JSON.parse(e.data) as SessionEvent])
        } catch (error) {
          console.error('[session-stream] invalid event', error)
        }
      }
      stream.onerror = () => {
        if (alive && stream === es) setStatus('error')
      }
      return stream
    }
    let es = openStream()
    // Mobile Safari (notably iOS 18) suspends a backgrounded EventSource and can
    // leave readyState OPEN without ever firing onerror, so the browser never
    // reconnects on its own and the tail silently dies. On each return to the
    // foreground we drop the maybe-dead socket and reopen — the fresh onopen
    // backfills whatever arrived while we were hidden.
    const reopen = () => {
      if (!alive) return
      es.close()
      es = openStream()
    }
    const onVisible = () => document.visibilityState === 'visible' && reopen()
    const onPageShow = (e: PageTransitionEvent) => e.persisted && reopen()
    void loadHistory()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      es.close()
      if (retry.current === loadHistory) retry.current = null
      setStatus('closed')
    }
  }, [sessionId, api, apply])

  const bound = boundSidRef.current === sessionId
  const visibleEvents = bound ? events : []
  const first = visibleEvents[0]
  const hasOlder = first !== undefined && first.sequence > 0 && !historyExhausted
  return {
    connectionRevision,
    events: visibleEvents,
    status,
    history: bound ? history : { status: 'loading' },
    retryHistory,
    hasOlder,
    loadingOlder,
    loadOlder,
  }
}
