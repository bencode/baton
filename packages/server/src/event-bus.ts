import type { SessionEvent } from '@baton/shared'
import { createPubSub, type PubSub } from './pubsub.ts'

// Session event bus: pub/sub keyed by sessionId. Daemon-emitted events and
// chat ingress publish here; SSE stream subscribers (browsers / CLIs) receive
// them live. No persistence — the server is a relay.
export type EventBus = PubSub<SessionEvent>

export const createEventBus = (): EventBus => createPubSub<SessionEvent>('event-bus')
