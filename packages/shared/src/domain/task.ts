import type { Code, Id } from './ids.ts'

// Execution dimension, aligned with Helm's flat board; blocked/ready are derived, not stored.
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'failed' | 'cancelled'

// Execution unit, always belongs to a Requirement. Tasks form a DAG via dependsOn.
// `projectId` is denormalized (also available via requirement) so the DB can enforce
// the project-scoped (projectId, code) UNIQUE constraint directly.
export type Task = {
  id: Id
  requirementId: Id
  projectId: Id
  code: Code // 'T-1', 'T-2', ...
  title: string
  spec?: string // short instruction; full spec lives in the repo, referenced via Requirement.resources
  requires: string[] // capability tags (including 'planning' ⇒ a Plan task)
  dependsOn: Id[] // prerequisite task ids (int FKs); presentation layers translate to codes
  status: TaskStatus
  createdAt: number
  updatedAt: number
}
