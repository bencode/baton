import type { Id } from '@baton/shared'

// Generic in-memory pub/sub keyed by an Id. Single-process; swap to Redis behind
// this interface for multi-process. Backs both the session event bus (keyed by
// sessionId) and the worker command bus (keyed by workerId).
type Subscriber<T> = (item: T) => void

export type PubSub<T> = {
  publish(key: Id, item: T): void
  subscribe(key: Id, cb: Subscriber<T>): () => void
  subscriberCount(key: Id): number
}

export const createPubSub = <T>(label: string): PubSub<T> => {
  const subs = new Map<Id, Set<Subscriber<T>>>()
  return {
    publish(key, item) {
      const set = subs.get(key)
      if (!set) return
      for (const cb of set) {
        try {
          cb(item)
        } catch (err) {
          console.error(`[${label}] subscriber threw`, err)
        }
      }
    },
    subscribe(key, cb) {
      let set = subs.get(key)
      if (!set) {
        set = new Set()
        subs.set(key, set)
      }
      set.add(cb)
      return () => {
        const s = subs.get(key)
        if (!s) return
        s.delete(cb)
        if (s.size === 0) subs.delete(key)
      }
    },
    subscriberCount(key) {
      return subs.get(key)?.size ?? 0
    },
  }
}
