import type { Code, Id } from './ids.ts'

// One execution of a Task by a Session: claim → events → terminal.
// `result` is a short conclusion (success / error_max_turns / custom failure
// reason). Detailed history lives in AssignmentEvent rows.
export type AssignmentStatus = 'running' | 'done' | 'failed' | 'abandoned'

export type Assignment = {
  id: Id
  projectId: Id
  code: Code // 'A-1'
  sessionId: Id
  taskId: Id
  status: AssignmentStatus
  result?: string
  startedAt: number
  endedAt?: number
}

// Opaque envelope for an SDK event (Claude Agent SDK message). baton stores
// the payload as JSON without interpreting it; the worker assigns a monotonic
// `sequence` so receivers can order and dedupe.
export type AssignmentEvent = {
  id: Id
  assignmentId: Id
  sequence: number
  payload: unknown
  createdAt: number
}
