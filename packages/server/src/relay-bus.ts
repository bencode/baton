import { randomBytes, randomUUID } from 'node:crypto'
import type { RelayMessage } from '@baton/shared'
import { createPubSub, type PubSub } from './pubsub.ts'

// In-memory Claude↔Claude relay. A channel is an unguessable id + a capability
// token; whoever holds the token can read and write. A bounded history buffer
// backs reconnect / late-join replay. No DB and no project/worker coupling —
// channels are ephemeral and die with the process (fine for a live back-channel:
// a restart just means re-sharing a fresh invite).
type Channel = { token: string; seq: number; history: RelayMessage[] }

const HISTORY_MAX = 200

export type AuthVerdict = 'ok' | 'unknown' | 'forbidden'

export type RelayBus = {
  create(): { channelId: string; token: string }
  auth(channelId: string, token: string): AuthVerdict
  // Append a message (stamps seq + ts), trim to the bounded buffer, and publish
  // to live subscribers. Returns null if the channel is gone.
  append(channelId: string, msg: { from: string; text: string }): RelayMessage | null
  // History strictly after `seq` — the SSE replay source.
  since(channelId: string, seq: number): RelayMessage[]
  bus: PubSub<RelayMessage, string>
}

export const createRelayBus = (): RelayBus => {
  const channels = new Map<string, Channel>()
  const bus = createPubSub<RelayMessage, string>('relay-bus')
  return {
    create() {
      const channelId = randomUUID()
      const token = randomBytes(32).toString('hex')
      channels.set(channelId, { token, seq: 0, history: [] })
      return { channelId, token }
    },
    auth(channelId, token) {
      const ch = channels.get(channelId)
      if (!ch) return 'unknown'
      return ch.token === token ? 'ok' : 'forbidden'
    },
    append(channelId, msg) {
      const ch = channels.get(channelId)
      if (!ch) return null
      const full: RelayMessage = { seq: ++ch.seq, from: msg.from, text: msg.text, ts: Date.now() }
      ch.history.push(full)
      if (ch.history.length > HISTORY_MAX) ch.history.shift()
      bus.publish(channelId, full)
      return full
    },
    since(channelId, seq) {
      return channels.get(channelId)?.history.filter(m => m.seq > seq) ?? []
    },
    bus,
  }
}
