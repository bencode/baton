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
    <div className="max-w-xl space-y-8">
      <form
        onSubmit={event => {
          event.preventDefault()
          void save()
        }}
        className="flex flex-col items-start gap-3"
      >
        <div className="flex w-full flex-col gap-2">
          <label htmlFor={`project-name-${projectId}`} className="block text-xs font-medium">
            Project name
          </label>
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
        <button
          type="submit"
          disabled={pending !== null || !draft.trim()}
          className="ui-button ui-primary"
        >
          {pending === 'save' ? 'Saving…' : 'Save changes'}
        </button>
        {saved && (
          <p role="status" className="text-sm text-ui-success">
            Changes saved.
          </p>
        )}
      </form>
      <section className="border-t border-ui-border pt-6">
        <h2 className="text-sm font-medium">Delete project</h2>
        <p className="mt-2 text-sm text-ui-muted">
          Permanently delete this project, its workers, conversations, requirements and tasks.
        </p>
        {confirming ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm">Delete this project?</span>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => setConfirming(false)}
              className="ui-button"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => void remove()}
              className="ui-button ui-danger"
            >
              {pending === 'delete' ? 'Deleting…' : 'Confirm delete'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => setConfirming(true)}
            className="ui-button ui-danger mt-3"
          >
            Delete project
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
        Loading project…
      </p>
    )
  if (error || !data)
    return (
      <p role="alert" className="text-sm text-ui-danger">
        Unable to load this project.
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
