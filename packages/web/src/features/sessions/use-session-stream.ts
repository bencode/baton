import type { Id, SessionEvent } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
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
  // Highest sequence merged so far — the resume point for reconnect backfills.
  // A ref (not state) so the value is current at reconnect time without
  // re-running the effect or stale-closing over an old events array.
  const lastSeqRef = useRef(0)

  useEffect(() => {
    if (sessionId === null) {
      setEvents([])
      setStatus('closed')
      return
    }
    setEvents([])
    setStatus('connecting')
    lastSeqRef.current = 0
    let alive = true
    let opened = false
    // True once a full (since=0) backfill has succeeded. Until then a reconnect
    // must re-pull everything — resuming from lastSeqRef would permanently hide
    // the history below the live tail's sequences.
    let loaded = false
    const apply = (incoming: SessionEvent[]) =>
      setEvents(prev => {
        const next = mergeEvents(prev, incoming)
        const last = next[next.length - 1]
        if (last) lastSeqRef.current = last.sequence
        return next
      })
    // The live tail is `?live=1` (no server replay) and EventSource auto-retries
    // on a drop, so anything created during a disconnect is absent from both the
    // post-reconnect tail and the one-shot history GET. Backfill from history on
    // every (re)open and merge: the first open pulls the whole transcript
    // (since 0), reconnects pull only events at/after the last sequence seen, so
    // a flaky mobile link doesn't re-download the full log on every blip.
    // mergeEvents dedupes by id, so the one-event overlap is harmless.
    const backfill = (since: number) =>
      api.sessions
        .listEvents(sessionId, since)
        .then(history => {
          if (!alive) return
          apply(history)
          if (since === 0) loaded = true
          // A failed backfill parks status on 'error'; if the tail is still up,
          // a later successful load means we are genuinely live again.
          if (es.readyState === EventSource.OPEN) setStatus('open')
        })
        .catch((err: unknown) => {
          if (!alive) return
          // A failed backfill means the transcript has a hole — keep the
          // "connection lost" banner up rather than lie with 'open'. The resume
          // point did not advance, so the next reconnect retries the same gap.
          console.error('[session-stream] history backfill failed', err)
          setStatus('error')
        })
    // Live tail first (so nothing created during the history fetch is missed —
    // the merge dedupes any overlap by id), then load history.
    const es = new EventSource(api.sessionStreamUrl(sessionId))
    es.onopen = () => {
      setStatus('open')
      // First open is covered by the initial backfill below; later opens are
      // reconnects, where only the gap since the last seen sequence is re-pulled
      // — unless the full transcript never loaded, then pull it all.
      if (opened) backfill(loaded ? lastSeqRef.current : 0)
      opened = true
    }
    es.onmessage = e => {
      try {
        const ev = JSON.parse(e.data) as SessionEvent
        apply([ev])
      } catch {
        // ignore malformed payloads
      }
    }
    es.onerror = () => setStatus('error')
    backfill(0)
    return () => {
      alive = false
      es.close()
      setStatus('closed')
    }
  }, [sessionId, api])

  return { events, status }
}
