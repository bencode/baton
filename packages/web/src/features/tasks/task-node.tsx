import type { Task } from '@baton/shared'
import { StatusDot } from '../../components/status-dot'

type TaskNodeProps = { task: Task; depth: number; active: boolean; onOpen: () => void }

// Leaf-row weight: regular weight, dot trails on the right. `depth` indents
// along the dependency chain; `↳` (or `↳N`) marks multi-dep tasks. "Ready" is
// surfaced in the task detail view, not at the row level.
export const TaskNode = ({ task, depth, active, onOpen }: TaskNodeProps) => {
  const deps = task.dependsOn.length
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
      <span className="truncate">{task.title}</span>
      <StatusDot status={task.status} className="ml-auto" />
    </button>
  )
}
