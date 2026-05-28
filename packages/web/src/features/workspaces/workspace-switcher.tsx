import { useNavigate } from 'react-router-dom'
import { workspacePath } from '../../app/route.ts'
import { useWorkspaces } from './use-workspaces.ts'

type WorkspaceSwitcherProps = { activeWorkspaceId: string | null }

export const WorkspaceSwitcher = ({ activeWorkspaceId }: WorkspaceSwitcherProps) => {
  const { data: workspaces } = useWorkspaces()
  const navigate = useNavigate()
  if (!workspaces || workspaces.length === 0)
    return <span className="text-sm text-gray-400">no workspace</span>
  return (
    <select
      aria-label="Workspace"
      value={activeWorkspaceId ?? ''}
      onChange={e => navigate(workspacePath(e.target.value))}
      className="rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
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
