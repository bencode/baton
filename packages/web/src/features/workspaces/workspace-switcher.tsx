import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { workspacePath } from '../../app/route'
import { PencilIcon } from '../../components/icons'
import { InlineRename } from '../../components/inline-rename'
import { Select } from '../../components/select'
import { bumpLists } from '../../hooks/use-list-revision'
import { useWorkspaces } from './use-workspaces'

type WorkspaceSwitcherProps = { activeWorkspaceId: Id | null; onNavigate?(): void }

export const WorkspaceSwitcher = ({ activeWorkspaceId, onNavigate }: WorkspaceSwitcherProps) => {
  const api = useApi()
  const { data: workspaces, loading, error: loadError } = useWorkspaces()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = workspaces?.find(workspace => workspace.id === activeWorkspaceId)
  const rename = async (name: string) => {
    setEditing(false)
    if (!active) return
    setError(null)
    try {
      await api.workspaces.update(active.id, { name })
      bumpLists()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <section className="wb-workspace-control" aria-label="工作区">
      <span className="ui-menu-caption block">工作区</span>
      {loadError ? (
        <p role="alert" className="px-3 py-2 text-xs text-ui-danger">
          无法加载工作区。
        </p>
      ) : loading ? (
        <p role="status" className="px-3 py-2 text-xs text-ui-muted">
          加载工作区…
        </p>
      ) : !workspaces?.length ? (
        <p className="px-3 py-2 text-xs text-ui-muted">暂无工作区</p>
      ) : (
        <div className="flex min-w-0 items-center gap-2 px-2">
          {editing && active ? (
            <InlineRename
              name={active.name}
              ariaLabel="工作区名称"
              onCommit={rename}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <Select
              aria-label="切换工作区"
              value={activeWorkspaceId === null ? null : String(activeWorkspaceId)}
              options={workspaces.map(workspace => ({
                value: String(workspace.id),
                label: workspace.name,
              }))}
              placeholder="选择工作区"
              className="min-w-0 flex-1"
              onValueChange={value => {
                navigate(workspacePath(Number(value)))
                onNavigate?.()
              }}
            />
          )}
          {active && !editing && (
            <button
              type="button"
              className="ui-icon-button"
              title="重命名工作区"
              aria-label="重命名工作区"
              onClick={() => {
                setError(null)
                setEditing(true)
              }}
            >
              <PencilIcon />
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-ui-danger">
          {error}
        </p>
      )}
    </section>
  )
}
