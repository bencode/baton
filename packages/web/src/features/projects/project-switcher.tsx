import type { Id } from '@baton/shared'
import { useNavigate } from 'react-router-dom'
import { projectPath } from '../../app/route'
import { useProjects } from './use-projects'

type ProjectSwitcherProps = { workspaceId: Id | null; activeProjectId: Id | null }

export const ProjectSwitcher = ({ workspaceId, activeProjectId }: ProjectSwitcherProps) => {
  const { data: projects } = useProjects(workspaceId)
  const navigate = useNavigate()
  if (!projects || projects.length === 0)
    return <span className="text-sm text-gray-400">no project</span>
  return (
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
  )
}
