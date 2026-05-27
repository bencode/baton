import type { Id } from './ids.ts'
import type { Task, TaskStatus } from './task.ts'

const TERMINAL: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['done', 'failed', 'cancelled'])

export const isTerminal = (status: TaskStatus): boolean => TERMINAL.has(status)

// Task progress summary: only *informs* requirement status / display — it neither equals nor mutates RequirementStatus.
export type TaskProgress = { total: number; done: number; inProgress: number; failed: number }

export const summarizeTaskProgress = (tasks: readonly Task[]): TaskProgress => ({
  total: tasks.length,
  done: tasks.filter(t => t.status === 'done').length,
  inProgress: tasks.filter(t => t.status === 'in_progress').length,
  failed: tasks.filter(t => t.status === 'failed').length,
})

// Whether all prerequisites are complete (done).
export const dependenciesMet = (task: Task, byId: ReadonlyMap<Id, Task>): boolean =>
  task.dependsOn.every(id => byId.get(id)?.status === 'done')

// ready is not stored, computed on demand: a todo task with all dependencies met can be claimed.
export const isReady = (task: Task, byId: ReadonlyMap<Id, Task>): boolean =>
  task.status === 'todo' && dependenciesMet(task, byId)
