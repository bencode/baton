import type { Id } from './ids.ts'

// Append-only chat / SDK event log per session.
// type discriminator (kept loose; payload shape is owned by the producer):
//   - user_message:  payload = { text: string }
//   - turn_start:    payload = { messageId: number }  — worker claims the next user_message
//   - sdk_event:     payload = a parsed line from `claude --output-format stream-json`
//   - turn_complete: payload = { exitCode: number }
//   - turn_error:    payload = { message: string }
//   - system:        payload = arbitrary control metadata
// processedAt only meaningful for user_message: null until the spawning turn ends.
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
  processedAt?: number
  createdAt: number
}
