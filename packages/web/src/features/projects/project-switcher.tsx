import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { projectPath, workspacePath } from '../../app/route'
import { InlineRename } from '../../components/inline-rename'
import { bumpLists } from '../../hooks/use-list-revision'
import { ProjectMenu } from './project-menu'
import { useProjects } from './use-projects'

type ProjectSwitcherProps = { workspaceId: Id | null; activeProjectId: Id | null }

export const ProjectSwitcher = ({ workspaceId, activeProjectId }: ProjectSwitcherProps) => {
  const api = useApi()
  const { data: projects } = useProjects(workspaceId)
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)

  const active = projects?.find(p => p.id === activeProjectId)

  const rename = async (next: string) => {
    setEditing(false)
    if (!active) return
    await api.projects.update(active.id, { name: next }).then(bumpLists, () => {})
  }
  const create = async (name: string) => {
    setCreating(false)
    if (workspaceId === null) return
    try {
      const p = await api.projects.create({ workspaceId, name })
      bumpLists()
      navigate(projectPath(p.id))
    } catch (err) {
      console.error('[projects] create failed', err)
    }
  }
  // Deleting a project cascades (its sessions/workers/requirements/tasks go too) —
  // ProjectMenu gates this behind a confirm. Land on another project, or the
  // workspace's empty state when it was the last one.
  const remove = async () => {
    if (!active) return
    const next = projects?.find(p => p.id !== active.id)
    const fallback = workspaceId !== null ? workspacePath(workspaceId) : '/'
    try {
      await api.projects.remove(active.id)
      bumpLists()
      navigate(next ? projectPath(next.id) : fallback)
    } catch (err) {
      console.error('[projects] delete failed', err)
    }
  }

  if (creating)
    return (
      <InlineRename
        name=""
        ariaLabel="new project name"
        onCommit={create}
        onCancel={() => setCreating(false)}
      />
    )
  if (editing && active)
    return (
      <InlineRename
        name={active.name}
        ariaLabel="project name"
        onCommit={rename}
        onCancel={() => setEditing(false)}
      />
    )

  // "+ new project" — available whenever a workspace is selected, so a member with
  // an empty workspace can create their first one.
  const newButton = workspaceId !== null && (
    <button
      type="button"
      title="new project"
      aria-label="new project"
      onClick={() => setCreating(true)}
      className="shrink-0 text-lg leading-none text-gray-400 transition-colors hover:text-gray-700"
    >
      ＋
    </button>
  )

  if (!projects || projects.length === 0)
    return (
      <span className="flex w-full items-center justify-between gap-1">
        <span className="text-sm text-gray-400">no project</span>
        {newButton}
      </span>
    )

  return (
    <span className="flex w-full items-center gap-1">
      <select
        aria-label="Project"
        value={activeProjectId ?? ''}
        onChange={e => navigate(projectPath(Number(e.target.value)))}
        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 transition-colors hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        {activeProjectId === null && (
          <option value="" disabled>
            project…
          </option>
        )}
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {active && <ProjectMenu onRename={() => setEditing(true)} onDelete={remove} />}
      {newButton}
    </span>
  )
}
