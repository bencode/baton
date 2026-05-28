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

// Lay out the task DAG for indented display: depth is the longest in-set
// dependency chain (so prerequisites sort before dependents); `seen` guards
// against cycles so a malformed DAG still terminates.
export type ArrangedTask = { task: Task; depth: number }

export const arrangeTasks = (tasks: readonly Task[]): ArrangedTask[] => {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const depthOf = (task: Task, seen: ReadonlySet<Id>): number => {
    const deps = task.dependsOn
      .map(id => byId.get(id))
      .filter((t): t is Task => t !== undefined && !seen.has(t.id))
    if (deps.length === 0) return 0
    const next = new Set([...seen, task.id])
    return 1 + Math.max(...deps.map(d => depthOf(d, next)))
  }
  return [...tasks]
    .map(task => ({ task, depth: depthOf(task, new Set<Id>()) }))
    .sort((a, b) => a.depth - b.depth || a.task.createdAt - b.task.createdAt)
}
