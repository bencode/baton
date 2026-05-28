import type { AssignmentEvent, Id } from '@baton/shared'

// In-memory pub/sub keyed by assignmentId. Single-process: M2 enough. For
// multi-process deployments switch to Redis pub/sub behind the same interface.
type Subscriber = (event: AssignmentEvent) => void

export type EventBus = {
  publish(assignmentId: Id, event: AssignmentEvent): void
  subscribe(assignmentId: Id, cb: Subscriber): () => void
  subscriberCount(assignmentId: Id): number
}

export const createEventBus = (): EventBus => {
  const subs = new Map<Id, Set<Subscriber>>()
  return {
    publish(assignmentId, event) {
      const set = subs.get(assignmentId)
      if (!set) return
      for (const cb of set) {
        try {
          cb(event)
        } catch (err) {
          console.error('[event-bus] subscriber threw', err)
        }
      }
    },
    subscribe(assignmentId, cb) {
      let set = subs.get(assignmentId)
      if (!set) {
        set = new Set()
        subs.set(assignmentId, set)
      }
      set.add(cb)
      return () => {
        const s = subs.get(assignmentId)
        if (!s) return
        s.delete(cb)
        if (s.size === 0) subs.delete(assignmentId)
      }
    },
    subscriberCount(assignmentId) {
      return subs.get(assignmentId)?.size ?? 0
    },
  }
}
