import type { Id } from './ids.ts'

// A chat / SDK transcript event. Persisted server-side (SessionEvent table,
// per-session monotonic `sequence`); the web loads history from the server and
// tails new events live over SSE. A user_message with no matching turn_start is
// the authoritative pending queue (see unstartedUserMessages below).
//
// type discriminator (kept loose; payload shape is owned by the producer):
//   - user_message:  payload = { text: string; attachments?: Attachment[]; images?: string[];
//                    planMode?: boolean }
//                    (images is legacy base64; attachments is the canonical path;
//                    planMode=true → worker runs this turn read-only, SDK permissionMode:'plan')
//   - turn_start:    payload = { messageId?: number }
//   - sdk_event:     payload = a parsed line from `claude --output-format stream-json`
//   - turn_complete: payload = { exitCode: number }
//   - turn_error:    payload = { message: string }
//   - system:        payload = arbitrary control metadata
export type SessionEventType =
  | 'user_message'
  | 'turn_start'
  | 'sdk_event'
  | 'turn_complete'
  | 'turn_error'
  | 'system'

export type SessionEvent = {
  id: Id
  sessionId: Id
  sequence: number
  type: SessionEventType
  payload: unknown
  // Kept on the type for wire compat — never set. Was the old 'daemon claimed
  // this user_message' handshake; queue state is now derived (see below).
  processedAt?: number
  createdAt: number
}

// Ids of user_messages whose turn has started — turn_start carries the source
// message id in payload.messageId. A user_message absent here hasn't been
// picked up yet.
export const startedMessageIds = (events: readonly SessionEvent[]): Set<Id> => {
  const ids = new Set<Id>()
  for (const e of events) {
    if (e.type !== 'turn_start') continue
    const id = (e.payload as { messageId?: unknown } | null)?.messageId
    if (typeof id === 'number') ids.add(id)
  }
  return ids
}

// The authoritative pending queue: persisted user_messages with no matching
// turn_start yet, in sequence order. State is derived purely from the durable
// event log — never a transient in-memory queue — so both the web (renders the
// QUEUED zone) and the session runner (drains it on (re)connect) agree, and a
// missed live SSE delivery can't strand a message.
export const unstartedUserMessages = (events: readonly SessionEvent[]): SessionEvent[] => {
  const started = startedMessageIds(events)
  return events.filter(e => e.type === 'user_message' && !started.has(e.id))
}
