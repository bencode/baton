import { isReady } from '@baton/shared'
import { useMemo } from 'react'
import { StatusBadge } from '../../components/status-badge'
import { useTask, useTasks } from './use-tasks'

type TaskDetailProps = { taskId: string }

export const TaskDetail = ({ taskId }: TaskDetailProps) => {
  const { data: task, loading } = useTask(taskId)
  const { data: siblings } = useTasks(task?.requirementId ?? null)
  const ready = useMemo(() => {
    if (!task || !siblings) return false
    const byId = new Map(siblings.map(t => [t.id, t]))
    return isReady(task, byId)
  }, [task, siblings])
  if (loading) return <div className="p-6 text-sm text-gray-400">loading…</div>
  if (!task) return <div className="p-6 text-sm text-gray-400">task not found</div>
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-1.5 text-xs tracking-wider text-gray-500 uppercase">
        <span>Task</span>
        <span aria-hidden="true" className="text-gray-300">
          ·
        </span>
        <span className="font-mono normal-case tracking-normal text-gray-400">
          {task.id.slice(0, 8)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">{task.title}</h2>
        <StatusBadge status={task.status} />
      </div>
      {task.spec && <p className="text-sm whitespace-pre-wrap text-gray-600">{task.spec}</p>}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 rounded-md border border-gray-100 bg-gray-50/60 p-3 text-sm text-gray-700">
        <dt className="text-gray-400">ready</dt>
        <dd>{ready ? 'yes, deps met' : 'no'}</dd>
        <dt className="text-gray-400">requires</dt>
        <dd>{task.requires.length ? task.requires.join(', ') : '—'}</dd>
        <dt className="text-gray-400">depends on</dt>
        <dd>{task.dependsOn.length ? `${task.dependsOn.length} task(s)` : '—'}</dd>
      </dl>
    </div>
  )
}
