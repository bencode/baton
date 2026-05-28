import type { Id } from '@baton/shared'
import { useNavigate } from 'react-router-dom'
import { workspacePath } from '../../app/route'
import { useWorkspaces } from './use-workspaces'

type WorkspaceSwitcherProps = { activeWorkspaceId: Id | null }

export const WorkspaceSwitcher = ({ activeWorkspaceId }: WorkspaceSwitcherProps) => {
  const { data: workspaces } = useWorkspaces()
  const navigate = useNavigate()
  if (!workspaces || workspaces.length === 0)
    return <span className="text-sm text-gray-400">no workspace</span>
  return (
    <select
      aria-label="Workspace"
      value={activeWorkspaceId ?? ''}
      onChange={e => navigate(workspacePath(Number(e.target.value)))}
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 transition-colors hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
    >
      {activeWorkspaceId === null && (
        <option value="" disabled>
          workspace…
        </option>
      )}
      {workspaces.map(w => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  )
}
