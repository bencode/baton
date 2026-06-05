import type { ExternalRef } from './github.ts'
import type { Code, Id } from './ids.ts'

// Execution dimension. `blocked` is stored and means "waiting on a human"
// (question asked, answer pending) — distinct from the *derived* dep-blocked
// (dependsOn not met), which is computed and never stored. `ready` stays derived.
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'failed' | 'cancelled'

// Execution unit, always belongs to a Requirement. Tasks form a DAG via dependsOn.
// `projectId` is denormalized (also available via requirement) so the DB can enforce
// the project-scoped (projectId, code) UNIQUE constraint directly.
export type Task = {
  id: Id
  requirementId: Id
  projectId: Id
  code: Code // 'T-1', 'T-2', ...
  title: string
  body?: string // detailed task content (Markdown); rendered with the shared Markdown component
  dependsOn: Id[] // prerequisite task ids (int FKs); presentation layers translate to codes
  status: TaskStatus
  external?: ExternalRef // light link to the external record this mirrors (e.g. GitHub issue)
  createdAt: number
  updatedAt: number
}

// Append-only comment on a Task: the collaboration record (progress, hand-off
// notes) and the cold-start memory a resuming worker reads. Text + git
// references only — file payloads travel over chat/Send, never on a Task.
// workerId undefined = a human author; set = the worker/agent that wrote it.
export type TaskComment = {
  id: Id
  taskId: Id
  body: string
  workerId?: Id
  createdAt: number
}
