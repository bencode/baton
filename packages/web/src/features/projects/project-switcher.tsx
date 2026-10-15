import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { projectPath } from '../../app/route'
import { PlusIcon } from '../../components/icons'
import { InlineRename } from '../../components/inline-rename'
import { bumpLists } from '../../hooks/use-list-revision'
import { useProjects } from './use-projects'

type ProjectSwitcherProps = { workspaceId: Id | null; activeProjectId: Id | null }

export const ProjectSwitcher = ({ workspaceId, activeProjectId }: ProjectSwitcherProps) => {
  const api = useApi()
  const { data: projects, loading, error: loadError } = useProjects(workspaceId)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = async (name: string) => {
    setCreating(false)
    if (workspaceId === null) return
    try {
      const project = await api.projects.create({ workspaceId, name })
      bumpLists()
      navigate(projectPath(project.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        {creating ? (
          <InlineRename
            name=""
            ariaLabel="new project name"
            onCommit={create}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <select
            aria-label="Project"
            value={activeProjectId ?? ''}
            disabled={workspaceId === null || loading}
            onChange={event => navigate(projectPath(Number(event.target.value)))}
            className="ui-context-select min-w-0 flex-1 md:max-w-56"
          >
            {!projects?.length || activeProjectId === null ? (
              <option value="">
                {loadError
                  ? 'Unable to load projects'
                  : loading && workspaceId !== null
                    ? 'Loading projects…'
                    : 'Select a project'}
              </option>
            ) : null}
            {projects?.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        )}
        {workspaceId !== null && !creating && (
          <button
            type="button"
            aria-label="new project"
            title="New project"
            onClick={() => {
              setError(null)
              setCreating(true)
            }}
            className="ui-icon-button"
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="max-w-64 text-xs text-ui-danger">
          {error}
        </p>
      )}
    </div>
  )
}
