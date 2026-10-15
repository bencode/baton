import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { workspacePath } from '../../app/route'
import { PencilIcon } from '../../components/icons'
import { InlineRename } from '../../components/inline-rename'
import { SelectControl } from '../../components/select-control'
import { bumpLists } from '../../hooks/use-list-revision'
import { useWorkspaces } from './use-workspaces'

type WorkspaceSwitcherProps = { activeWorkspaceId: Id | null }

export const WorkspaceSwitcher = ({ activeWorkspaceId }: WorkspaceSwitcherProps) => {
  const api = useApi()
  const { data: workspaces } = useWorkspaces()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  if (!workspaces || workspaces.length === 0)
    return <span className="text-[13px] text-ui-muted">no workspace</span>
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
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <SelectControl
        aria-label="Workspace"
        value={activeWorkspaceId ?? ''}
        onChange={e => navigate(workspacePath(Number(e.target.value)))}
        tone="quiet"
        className="min-w-0 flex-1"
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
      </SelectControl>
      {active && (
        <button
          type="button"
          title="rename workspace"
          aria-label="rename workspace"
          onClick={() => setEditing(true)}
          className="ui-icon-button shrink-0"
        >
          <PencilIcon />
        </button>
      )}
    </span>
  )
}
