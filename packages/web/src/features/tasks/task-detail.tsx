import { StatusBadge } from '../../components/status-badge.tsx'
import { useTask } from './use-tasks.ts'

type TaskDetailProps = { taskId: string }

export const TaskDetail = ({ taskId }: TaskDetailProps) => {
  const { data: task, loading } = useTask(taskId)
  if (loading) return <div className="p-6 text-sm text-gray-400">loading…</div>
  if (!task) return <div className="p-6 text-sm text-gray-400">task not found</div>
  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <span className="text-xs tracking-wide text-gray-400 uppercase">Task</span>
        <StatusBadge status={task.status} />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{task.title}</h2>
      {task.spec && <p className="text-sm whitespace-pre-wrap text-gray-600">{task.spec}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-gray-600">
        <dt className="text-gray-400">requires</dt>
        <dd>{task.requires.length ? task.requires.join(', ') : '—'}</dd>
        <dt className="text-gray-400">depends on</dt>
        <dd>{task.dependsOn.length ? `${task.dependsOn.length} task(s)` : '—'}</dd>
      </dl>
      <p className="text-xs text-gray-400">Status controls and execution: next plan.</p>
    </div>
  )
}
