import type { RelayMessage } from '@baton/shared'
import { EventSource } from 'eventsource'

export type RelayChannel = { channelId: string; token: string }

export type ListenOpts = {
  // Replay history strictly after this seq (0 = full buffer for a late joiner).
  since?: number
  onMessage: (m: RelayMessage) => void
  onError?: (e: unknown) => void
}

// Relay client. Deliberately independent of the shared `request` helper / cookie
// gate / global auth headers: a channel authenticates only with its own token,
// passed explicitly per call. Keeps the relay a self-contained auth domain.
export type RelayClient = {
  create(): Promise<RelayChannel>
  send(channelId: string, token: string, msg: { from: string; text: string }): Promise<RelayMessage>
  // Subscribe to a channel. EventSource auto-reconnects on drop; we dedupe by a
  // monotonic cursor so a reconnect's history replay never delivers twice.
  // Returns a close fn.
  listen(channelId: string, token: string, opts: ListenOpts): () => void
}

export const relayClient = (baseUrl: string): RelayClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  const authed = (token: string) => ({ authorization: `Bearer ${token}` })
  return {
    create: async () => {
      const res = await fetch(u('/relay/channels'), { method: 'POST' })
      if (!res.ok) throw new Error(`POST /relay/channels → ${res.status}: ${await res.text()}`)
      return (await res.json()) as RelayChannel
    },
    send: async (channelId, token, msg) => {
      const res = await fetch(u(`/relay/channels/${channelId}/messages`), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authed(token) },
        body: JSON.stringify(msg),
      })
      if (!res.ok) throw new Error(`POST relay message → ${res.status}: ${await res.text()}`)
      return (await res.json()) as RelayMessage
    },
    listen: (channelId, token, opts) => {
      let cursor = opts.since ?? 0
      const es = new EventSource(u(`/relay/channels/${channelId}/stream?since=${cursor}`), {
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), ...authed(token) },
          }),
      })
      es.onmessage = e => {
        try {
          const m = JSON.parse(e.data) as RelayMessage
          if (m.seq <= cursor) return
          cursor = m.seq
          opts.onMessage(m)
        } catch (err) {
          opts.onError?.(err)
        }
      }
      es.onerror = err => opts.onError?.(err)
      return () => es.close()
    },
  }
}
