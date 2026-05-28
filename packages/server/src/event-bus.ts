import type { Id, SessionEvent } from '@baton/shared'

// In-memory pub/sub keyed by sessionId. Single-process: M2.5 enough. For
// multi-process deployments swap to Redis pub/sub behind the same interface.
type Subscriber = (event: SessionEvent) => void

export type EventBus = {
  publish(sessionId: Id, event: SessionEvent): void
  subscribe(sessionId: Id, cb: Subscriber): () => void
  subscriberCount(sessionId: Id): number
}

export const createEventBus = (): EventBus => {
  const subs = new Map<Id, Set<Subscriber>>()
  return {
    publish(sessionId, event) {
      const set = subs.get(sessionId)
      if (!set) return
      for (const cb of set) {
        try {
          cb(event)
        } catch (err) {
          console.error('[event-bus] subscriber threw', err)
        }
      }
    },
    subscribe(sessionId, cb) {
      let set = subs.get(sessionId)
      if (!set) {
        set = new Set()
        subs.set(sessionId, set)
      }
      set.add(cb)
      return () => {
        const s = subs.get(sessionId)
        if (!s) return
        s.delete(cb)
        if (s.size === 0) subs.delete(sessionId)
      }
    },
    subscriberCount(sessionId) {
      return subs.get(sessionId)?.size ?? 0
    },
  }
}
