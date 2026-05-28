import type { Code, Id } from './ids.ts'

// A Session represents a long-lived worker presence. The actual Worker concept
// (capabilities, identity) is folded into the Session record so M2 has one
// persisted unit; future skill-mode (claude-code as a tool) can reuse the same
// shape with `mode = 'skill'`. apiToken stays server-side, never in domain JSON.
export type SessionMode = 'worker' | 'skill'
export type SessionStatus = 'active' | 'idle' | 'closed'

export type Session = {
  id: Id
  projectId: Id
  code: Code // 'S-1'
  mode: SessionMode
  name: string
  capabilities: string[]
  status: SessionStatus
  startedAt: number
  heartbeatAt: number
  closedAt?: number
}
