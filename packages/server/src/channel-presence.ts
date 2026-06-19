import type { ChannelMember, MemberKind } from '@baton/shared'

// In-memory channel presence: Map<channelId, Map<name, {lastSeen, kind}>>. Like
// worker liveness, this is "right now" data — ephemeral, no DB. join and heartbeat
// are the same idempotent `touch`; `list` (the roster) returns only members seen
// within the TTL window, lazily dropping stale ones. After a restart the roster is
// empty until each participant's next heartbeat/activity — messages still live in
// the DB, so a reconnecting client's ?since= replay bridges the gap.
//
// Heartbeat window: 90s. Streaming clients hold the SSE open (refreshed on connect
// + each keepalive) and pollers re-touch per cycle, so two missed pings are
// tolerable. `list` lazy-deletes stale entries; `startPresencePrune` sweeps
// abandoned rooms no one happens to query.
const PRESENCE_TTL_MS = 90_000

type Entry = { lastSeen: number; kind: MemberKind }

export type ChannelPresence = {
  touch(channelId: string, name: string, kind: MemberKind): void
  leave(channelId: string, name: string): void
  // Drop the whole room's roster at once — used when a channel is deleted.
  drop(channelId: string): void
  // Is this name currently claimed (a fresh presence entry)? Used to reject a
  // colliding JOIN so two participants can't share a name (the echo filter and
  // roster are name-keyed, so same-name members would be invisible to each other).
  isOnline(channelId: string, name: string, now?: number): boolean
  list(channelId: string, now?: number): ChannelMember[]
  prune(now?: number): number
}

const isFresh = (lastSeen: number, now: number): boolean => now - lastSeen < PRESENCE_TTL_MS

export const createChannelPresence = (): ChannelPresence => {
  const rooms = new Map<string, Map<string, Entry>>()
  return {
    touch(channelId, name, kind) {
      const room = rooms.get(channelId) ?? new Map<string, Entry>()
      rooms.set(channelId, room)
      room.set(name, { lastSeen: Date.now(), kind })
    },
    leave(channelId, name) {
      rooms.get(channelId)?.delete(name)
    },
    drop(channelId) {
      rooms.delete(channelId)
    },
    isOnline(channelId, name, now = Date.now()) {
      const e = rooms.get(channelId)?.get(name)
      return e !== undefined && isFresh(e.lastSeen, now)
    },
    list(channelId, now = Date.now()) {
      const room = rooms.get(channelId)
      if (!room) return []
      const out: ChannelMember[] = []
      for (const [name, e] of room) {
        if (isFresh(e.lastSeen, now)) out.push({ name, kind: e.kind, lastSeenAt: e.lastSeen })
        else room.delete(name) // lazy cleanup, mirroring liveness.isAlive
      }
      if (room.size === 0) rooms.delete(channelId)
      return out
    },
    prune(now = Date.now()) {
      let removed = 0
      for (const [id, room] of rooms) {
        for (const [name, e] of room)
          if (!isFresh(e.lastSeen, now)) {
            room.delete(name)
            removed += 1
          }
        if (room.size === 0) rooms.delete(id)
      }
      return removed
    },
  }
}

// Periodic sweep, mirroring startLivenessPrune: a safety net for abandoned rooms
// nobody queries. Runs unref'd (doesn't keep the event loop alive); returns stop().
export const startPresencePrune = (
  presence: ChannelPresence,
  intervalMs = 60_000,
): { stop: () => void } => {
  const t = setInterval(() => {
    try {
      presence.prune()
    } catch (err) {
      console.error('[channel-presence] prune threw', err)
    }
  }, intervalMs)
  if (typeof t.unref === 'function') t.unref()
  return { stop: () => clearInterval(t) }
}
