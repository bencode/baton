import type { Id } from './ids.ts'

// Ephemeral chat / SDK event. As of 2026 these are no longer persisted on
// the server — the server synthesizes id/sequence/createdAt at publish time
// for SSE delivery; the browser keeps its own copy in IndexedDB. Sequence
// numbers reset on server restart, harmless because there's no replay to
// dedupe against.
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
  // Kept on the type for wire compat — never set under the new model. Was
  // the old 'daemon claimed this user_message' handshake.
  processedAt?: number
  createdAt: number
}
