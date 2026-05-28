import type { Task } from '@baton/shared'
import { StatusBadge } from '../../components/status-badge'

type TaskNodeProps = {
  task: Task
  depth: number
  ready: boolean
  active: boolean
  onOpen: () => void
}

// `depth` indents along the dependency chain; the ↳ marker shows it depends on
// others (↳×N for multiple). `ready` flags a todo task whose deps are all done.
export const TaskNode = ({ task, depth, ready, active, onOpen }: TaskNodeProps) => {
  const deps = task.dependsOn.length
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
      className={`flex w-full items-center gap-2 rounded py-1 pr-2 text-left text-sm ${
        active ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {deps > 0 && <span className="text-gray-400">{deps > 1 ? `↳×${deps}` : '↳'}</span>}
      <span className="truncate">{task.title}</span>
      <StatusBadge status={task.status} />
      {ready && <span className="text-[10px] font-medium text-green-600">ready</span>}
    </button>
  )
}
