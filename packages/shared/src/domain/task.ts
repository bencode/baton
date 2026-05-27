import type { Id } from './ids.ts'

// Execution dimension, aligned with Helm's flat board; blocked/ready are derived, not stored.
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'failed' | 'cancelled'

// Execution unit, always belongs to a Requirement. Tasks form a DAG via dependsOn.
export type Task = {
  id: Id
  requirementId: Id
  title: string
  spec?: string // short instruction; full spec lives in the repo, referenced via Requirement.resources
  requires: string[] // capability tags (including 'planning' ⇒ a Plan task)
  dependsOn: Id[] // prerequisite tasks, forming a DAG
  status: TaskStatus
  createdAt: number
  updatedAt: number
}
