import { type Code, type Id, isReady } from '@baton/shared'
import { useMemo } from 'react'
import { Markdown } from '../../components/markdown'
import { StatusBadge } from '../../components/status-badge'
import { TaskComments } from './task-comments'
import { useTaskByCode, useTasks } from './use-tasks'

type TaskDetailProps = { projectId: Id; code: Code }

export const TaskDetail = ({ projectId, code }: TaskDetailProps) => {
  const { data: task, loading } = useTaskByCode(projectId, code)
  const { data: siblings } = useTasks(task?.requirementId ?? null)
  const ready = useMemo(() => {
    if (!task || !siblings) return false
    const byId = new Map(siblings.map(t => [t.id, t]))
    return isReady(task, byId)
  }, [task, siblings])
  if (loading) return <div className="p-6 text-sm text-ui-muted">loading…</div>
  if (!task) return <div className="p-6 text-sm text-ui-muted">task not found</div>
  return (
    <div className="ui-page flex flex-col gap-4">
      <div className="flex items-center gap-1.5 text-xs text-ui-muted">
        <span>Task</span>
        <span aria-hidden="true" className="text-ui-muted">
          ·
        </span>
        <span className="font-mono normal-case tracking-normal text-ui-muted">{task.code}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="ui-page-title">{task.title}</h2>
        <StatusBadge status={task.status} />
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 rounded-md border border-ui-border bg-ui-panel/60 p-4 text-[13px] text-ui-text">
        <dt className="text-ui-muted">ready</dt>
        <dd>{ready ? 'yes, deps met' : 'no'}</dd>
        <dt className="text-ui-muted">depends on</dt>
        <dd>{task.dependsOn.length ? `${task.dependsOn.length} task(s)` : '—'}</dd>
      </dl>
      {/* body is long-form (article-like), so it sits below the essential props */}
      {task.body && <Markdown text={task.body} />}
      <TaskComments projectId={projectId} taskId={task.id} />
    </div>
  )
}
