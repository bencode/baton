import type { Id, SessionEvent, SessionEventType } from '@baton/shared'

// Ephemeral event identity. Session events are no longer persisted server-side
// (the browser stores them per-session in IndexedDB). To keep the SSE wire
// format identical for clients, we synthesize `id`, `sequence`, and `createdAt`
// in memory at publish time.
//
// Sequence counters are per-(server-lifetime × session). On server restart
// they reset to 0 — harmless because there's no history replay to dedupe
// against; SSE clients only dedupe within a single connection.
let nextEphemeralId = 1
const sessionSeq = new Map<Id, number>()
const nextSeq = (sessionId: Id): number => {
  const cur = (sessionSeq.get(sessionId) ?? -1) + 1
  sessionSeq.set(sessionId, cur)
  return cur
}

export const synthesize = (
  sessionId: Id,
  type: SessionEventType,
  payload: unknown,
): SessionEvent => ({
  id: nextEphemeralId++,
  sessionId,
  sequence: nextSeq(sessionId),
  type,
  payload,
  createdAt: Date.now(),
})

// Drop a session's sequence counter on delete so the Map doesn't leak.
export const forgetSessionSeq = (sessionId: Id): void => {
  sessionSeq.delete(sessionId)
}
