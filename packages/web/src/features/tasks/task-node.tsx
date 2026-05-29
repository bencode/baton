import type { Task, TaskStatus } from '@baton/shared'
import { StateChip } from '../../components/state-chip'

type TaskNodeProps = { task: Task; depth: number; active: boolean; onOpen: () => void }

// Leaf-row weight: regular weight, code (T-N) sits before the title in mono.
// `depth` indents along the dependency chain; `↳` (or `↳N`) marks multi-dep
// tasks. State chip goes RIGHT (same as requirement / session rows) so the
// left column reads as pure structure. "Ready" is surfaced in the task detail
// view, not at the row level.
export const TaskNode = ({ task, depth, active, onOpen }: TaskNodeProps) => {
  const deps = task.dependsOn.length
  const cancelled = task.status === 'cancelled'
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ paddingLeft: `${28 + depth * 14}px` }}
      className={`flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-sm transition-colors duration-150 ${
        active ? 'bg-blue-50 text-blue-900' : 'text-gray-600 hover:bg-gray-100/70'
      }`}
    >
      {deps > 0 && (
        <span className="font-mono text-xs text-gray-400" aria-hidden="true">
          {deps > 1 ? `↳${deps}` : '↳'}
        </span>
      )}
      <span className="shrink-0 font-mono text-xs text-gray-400">{task.code}</span>
      <span className={`truncate ${cancelled ? 'line-through opacity-60' : ''}`}>{task.title}</span>
      <span className="ml-auto">
        <TaskStateChip status={task.status} />
      </span>
    </button>
  )
}

const TaskStateChip = ({ status }: { status: TaskStatus }) => {
  if (status === 'todo') return <StateChip kind="none" />
  if (status === 'in_progress') return <StateChip kind="pulse" label="in progress" />
  if (status === 'done') return <StateChip kind="text" label="done" tone="success" />
  if (status === 'failed') return <StateChip kind="text" label="failed" tone="danger" />
  return <StateChip kind="text" label="cancelled" tone="muted" />
}
