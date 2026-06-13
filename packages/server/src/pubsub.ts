import type { Id } from '@baton/shared'

// Generic in-memory pub/sub keyed by `K` (default Id). Single-process; swap to
// Redis behind this interface for multi-process. Backs the session event bus and
// worker command bus (keyed by numeric Id) and the relay bus (keyed by a UUID
// channel string).
type Subscriber<T> = (item: T) => void
type Key = string | number

export type PubSub<T, K extends Key = Id> = {
  publish(key: K, item: T): void
  subscribe(key: K, cb: Subscriber<T>): () => void
  // Does this key have at least one live subscriber? For the command bus this
  // answers "is this worker's daemon currently streaming" — a per-worker
  // signal, unlike machineId liveness which is shared across same-machine workers.
  has(key: K): boolean
}

export const createPubSub = <T, K extends Key = Id>(label: string): PubSub<T, K> => {
  const subs = new Map<K, Set<Subscriber<T>>>()
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
    has(key) {
      return (subs.get(key)?.size ?? 0) > 0
    },
  }
}
