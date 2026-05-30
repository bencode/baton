import type { Id, WorkerCommand } from '@baton/shared'

// In-memory pub/sub keyed by workerId — the server→worker push channel. A
// persistent worker daemon subscribes (GET /workers/me/stream) and receives
// session.create / session.delete commands. Single-process like the event bus;
// swap to Redis behind this interface for multi-process later.
type Subscriber = (cmd: WorkerCommand) => void

export type CommandBus = {
  publish(workerId: Id, cmd: WorkerCommand): void
  subscribe(workerId: Id, cb: Subscriber): () => void
}

export const createCommandBus = (): CommandBus => {
  const subs = new Map<Id, Set<Subscriber>>()
  return {
    publish(workerId, cmd) {
      const set = subs.get(workerId)
      if (!set) return
      for (const cb of set) {
        try {
          cb(cmd)
        } catch (err) {
          console.error('[command-bus] subscriber threw', err)
        }
      }
    },
    subscribe(workerId, cb) {
      let set = subs.get(workerId)
      if (!set) {
        set = new Set()
        subs.set(workerId, set)
      }
      set.add(cb)
      return () => {
        const s = subs.get(workerId)
        if (!s) return
        s.delete(cb)
        if (s.size === 0) subs.delete(workerId)
      }
    },
  }
}
