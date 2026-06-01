import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { workspacePath } from '../../app/route'
import { InlineRename } from '../../components/inline-rename'
import { bumpLists } from '../../hooks/use-list-revision'
import { useWorkspaces } from './use-workspaces'

type WorkspaceSwitcherProps = { activeWorkspaceId: Id | null }

export const WorkspaceSwitcher = ({ activeWorkspaceId }: WorkspaceSwitcherProps) => {
  const api = useApi()
  const { data: workspaces } = useWorkspaces()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  if (!workspaces || workspaces.length === 0)
    return <span className="text-sm text-gray-400">no workspace</span>
  const active = workspaces.find(w => w.id === activeWorkspaceId)
  const rename = async (next: string) => {
    setEditing(false)
    if (!active) return
    await api.workspaces.update(active.id, { name: next }).then(bumpLists, () => {})
  }
  if (editing && active)
    return (
      <InlineRename
        name={active.name}
        ariaLabel="workspace name"
        onCommit={rename}
        onCancel={() => setEditing(false)}
      />
    )
  return (
    <span className="inline-flex items-center gap-1">
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
      {active && (
        <button
          type="button"
          title="rename workspace"
          aria-label="rename workspace"
          onClick={() => setEditing(true)}
          className="text-xs text-gray-400 transition-colors hover:text-gray-700"
        >
          ✎
        </button>
      )}
    </span>
  )
}
