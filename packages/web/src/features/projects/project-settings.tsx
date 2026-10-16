import type { Id } from '@baton/shared'
import { useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { projectPath, workspacePath } from '../../app/route'
import { bumpLists } from '../../hooks/use-list-revision'
import { useProject } from './use-projects'

type ProjectSettingsProps = {
  projectId: Id
  onDeleted(projectId: Id, fallbackPath: string): void
}

// The loaded project keys the form so background refreshes do not overwrite edits.
const SettingsForm = ({
  projectId,
  name,
  workspaceId,
  onDeleted,
}: ProjectSettingsProps & { name: string; workspaceId: Id }) => {
  const api = useApi()
  const [draft, setDraft] = useState(name)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const latestDeleted = useRef(onDeleted)
  latestDeleted.current = onDeleted
  const save = async () => {
    if (pending || !draft.trim()) return
    setPending('save')
    setError(null)
    setSaved(false)
    try {
      await api.projects.update(projectId, { name: draft.trim() })
      bumpLists()
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setPending(null)
    }
  }
  const remove = async () => {
    if (pending) return
    setPending('delete')
    setError(null)
    try {
      // Resolve the landing before deleting; a list failure must not report a completed deletion as failed.
      const projects = await api.projects.listByWorkspace(workspaceId)
      const next = projects.find(project => project.id !== projectId)
      await api.projects.remove(projectId)
      bumpLists()
      latestDeleted.current(projectId, next ? projectPath(next.id) : workspacePath(workspaceId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPending(null)
    }
  }
  return (
    <div className="mg-settings">
      <form
        onSubmit={event => {
          event.preventDefault()
          void save()
        }}
        className="mg-form"
      >
        <div className="mg-field">
          <label htmlFor={`project-name-${projectId}`}>项目名称</label>
          <input
            id={`project-name-${projectId}`}
            value={draft}
            disabled={pending !== null}
            onChange={event => {
              setDraft(event.target.value)
              setSaved(false)
            }}
            className="ui-input w-full"
          />
        </div>
        <div className="mg-form-actions mg-form-actions-start">
          <button
            type="submit"
            disabled={pending !== null || !draft.trim()}
            className="ui-button ui-primary self-start"
          >
            {pending === 'save' ? '保存中…' : '保存更改'}
          </button>
          {saved && (
            <p role="status" className="text-sm text-ui-success">
              已保存
            </p>
          )}
        </div>
      </form>
      <section className="mg-danger-section">
        <h2 className="text-sm font-medium">删除项目</h2>
        <p className="mt-2 text-sm text-ui-muted">永久删除此项目及其执行环境、会话、需求和任务。</p>
        {confirming ? (
          <div className="mg-confirm">
            <p>确认删除“{name}”及其全部资源？</p>
            <div className="mg-form-actions">
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => setConfirming(false)}
                className="ui-button"
              >
                取消
              </button>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void remove()}
                className="ui-button ui-danger"
              >
                {pending === 'delete' ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => setConfirming(true)}
            className="ui-button ui-danger mt-3"
          >
            删除项目
          </button>
        )}
      </section>
      {error && (
        <p role="alert" className="text-sm text-ui-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export const ProjectSettings = ({ projectId, onDeleted }: ProjectSettingsProps) => {
  const { data, loading, error } = useProject(projectId)
  // Deletion still closes the removed resource's tabs even if this tab became hidden.
  if (loading && !data)
    return (
      <p role="status" className="text-sm text-ui-muted">
        加载项目…
      </p>
    )
  if (error || !data)
    return (
      <p role="alert" className="text-sm text-ui-danger">
        无法加载项目。
        <button type="button" onClick={bumpLists} className="ml-2 underline">
          重试
        </button>
      </p>
    )
  return (
    <SettingsForm
      key={projectId}
      projectId={projectId}
      name={data.name}
      workspaceId={data.workspaceId}
      onDeleted={onDeleted}
    />
  )
}
