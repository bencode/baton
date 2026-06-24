import type { ChannelMessage } from '@baton/shared'
import { createPubSub, type PubSub } from './pubsub.ts'

// Live fan-out for channel messages, keyed by channelId (a UUID string), exactly
// like the relay bus. Pure broadcast with no history: the DB is the authority
// (channels.appendMessage persists first), so a subscriber that connects
// mid-write still catches up via the ?since= DB replay in streamBus.
export type ChannelBus = PubSub<ChannelMessage, string>

export const createChannelBus = (): ChannelBus =>
  createPubSub<ChannelMessage, string>('channel-bus')
