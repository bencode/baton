import type { ChannelMessage } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import type { ChannelApi } from './channel-api'

export type ChannelStreamState = {
  messages: ChannelMessage[]
  status: 'connecting' | 'open' | 'error' | 'closed'
}

// Dedupe by per-channel `seq`, order by `seq`. The stream replays history (seq>since)
// then tails live, and reconnects re-replay the gap — so the same message can arrive
// twice. Pure → easy to reason about.
export const mergeMessages = (
  existing: ChannelMessage[],
  incoming: ChannelMessage[],
): ChannelMessage[] => {
  if (incoming.length === 0) return existing
  const bySeq = new Map<number, ChannelMessage>()
  for (const m of existing) bySeq.set(m.seq, m)
  for (const m of incoming) bySeq.set(m.seq, m)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

// Live transcript over the channel SSE. Unlike the session stream we don't page
// history separately: `/stream?since=N` already replays seq>N then follows, so a
// first open with since=0 yields the full history + live tail in one connection;
// reconnects resume from the highest seq seen (gap replay), deduped by seq.
// `active` gates opening until the user has picked a name (so `?as` isn't a ghost).
export const useChannelStream = (
  api: ChannelApi,
  channelId: string,
  as: string,
  active: boolean,
): ChannelStreamState => {
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [status, setStatus] = useState<ChannelStreamState['status']>('connecting')
  const lastSeqRef = useRef(0)
  // Which room the transcript belongs to — so a rename (which only changes `as`)
  // reconnects without wiping the history.
  const roomRef = useRef('')

  useEffect(() => {
    if (!active) {
      setStatus('closed')
      return
    }
    // Reset the transcript only when the room itself changes. A rename switches
    // `as` to move presence, but must NOT clear + full-reload history; instead
    // resume in place from the last seq seen (gap replay), so messages don't
    // flicker and nothing is re-fetched needlessly.
    if (roomRef.current !== channelId) {
      roomRef.current = channelId
      setMessages([])
      lastSeqRef.current = 0
    }
    setStatus('connecting')
    let alive = true
    const apply = (m: ChannelMessage) =>
      setMessages(prev => {
        const next = mergeMessages(prev, [m])
        const last = next[next.length - 1]
        if (last) lastSeqRef.current = last.seq
        return next
      })
    const open = (): EventSource => {
      const es = new EventSource(api.streamUrl(channelId, { as, since: lastSeqRef.current }))
      es.onopen = () => setStatus('open')
      es.onmessage = e => {
        try {
          apply(JSON.parse(e.data) as ChannelMessage)
        } catch {
          // ignore malformed payloads (e.g. keepalive comments)
        }
      }
      es.onerror = () => setStatus('error')
      return es
    }
    let es = open()
    // Mobile Safari (iOS 18) can suspend a backgrounded EventSource without ever
    // firing onerror, so the tail silently dies. On return to the foreground drop
    // the maybe-dead socket and reopen — the fresh open resumes from lastSeq.
    const reopen = () => {
      if (!alive) return
      es.close()
      es = open()
    }
    const onVisible = () => document.visibilityState === 'visible' && reopen()
    const onPageShow = (e: PageTransitionEvent) => e.persisted && reopen()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      es.close()
      setStatus('closed')
    }
  }, [api, channelId, as, active])

  return { messages, status }
}
