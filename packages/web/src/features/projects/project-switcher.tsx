import type { Id } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { projectPath } from '../../app/route'
import { CheckIcon, ChevronDownIcon, PlusIcon } from '../../components/icons'
import { Popover } from '../../components/popover'
import { bumpLists } from '../../hooks/use-list-revision'
import { useProjects } from './use-projects'

type ProjectSwitcherProps = {
  workspaceId: Id | null
  activeProjectId: Id | null
  onNavigate?(): void
}

export const ProjectSwitcher = ({
  workspaceId,
  activeProjectId,
  onNavigate,
}: ProjectSwitcherProps) => {
  const api = useApi()
  const { data, loading, error: loadError } = useProjects(workspaceId)
  const projects = data?.filter(project => project.workspaceId === workspaceId)
  const active = projects?.find(project => project.id === activeProjectId)
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [editing, setEditing] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) nameInput.current?.focus()
  }, [editing])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = (id: Id) => {
    setAnchor(null)
    navigate(projectPath(id))
    onNavigate?.()
  }
  const create = async () => {
    const trimmed = name.trim()
    if (workspaceId === null || !trimmed || creating) return
    setCreating(true)
    setError(null)
    try {
      const project = await api.projects.create({ workspaceId, name: trimmed })
      bumpLists()
      setEditing(false)
      setName('')
      go(project.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCreating(false)
    }
  }
  return (
    <>
      <button
        type="button"
        className="wb-project-trigger"
        disabled={workspaceId === null || loading}
        aria-label="切换项目"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        title={active?.name ?? '选择项目'}
        onClick={event => {
          setAnchor(anchor ? null : event.currentTarget)
          setError(null)
        }}
      >
        <span>{active?.name ?? (loading && workspaceId !== null ? '加载项目…' : '选择项目')}</span>
        <ChevronDownIcon />
      </button>
      <Popover
        anchor={anchor}
        role="dialog"
        label="项目"
        className="wb-project-menu"
        onClose={() => {
          setAnchor(null)
          if (!creating) setEditing(false)
        }}
      >
        <div className="ui-menu-caption">切换项目</div>
        {loadError && (
          <p role="alert" className="px-3 py-2 text-xs text-ui-danger">
            无法加载项目。
            <button type="button" className="underline" onClick={bumpLists}>
              重试
            </button>
          </p>
        )}
        <div role="menu" aria-label="项目列表">
          {projects?.map(project => (
            <button
              key={project.id}
              type="button"
              role="menuitemradio"
              aria-checked={project.id === activeProjectId}
              className="ui-menu-item"
              onClick={() => go(project.id)}
            >
              <span className="min-w-0 flex-1 truncate" title={project.name}>
                {project.name}
              </span>
              {project.id === activeProjectId && <CheckIcon />}
            </button>
          ))}
        </div>
        {!loadError && !projects?.length && (
          <p className="px-3 py-2 text-xs text-ui-muted">还没有项目。</p>
        )}
        <div className="ui-menu-rule" />
        {editing ? (
          <form
            className="space-y-3 p-3"
            onSubmit={event => {
              event.preventDefault()
              void create()
            }}
          >
            <label className="block text-xs" htmlFor="new-project-name">
              项目名称
            </label>
            <input
              ref={nameInput}
              id="new-project-name"
              className="ui-input w-full"
              value={name}
              disabled={creating}
              onChange={event => setName(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={creating}
                className="ui-button"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating || !name.trim()}
                className="ui-button ui-primary"
              >
                {creating ? '创建中…' : '创建'}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="ui-menu-item"
            onClick={() => {
              setEditing(true)
              setName('')
              setError(null)
            }}
          >
            <PlusIcon />
            新建项目
          </button>
        )}
        {error && (
          <p role="alert" className="px-3 py-2 text-xs text-ui-danger">
            {error}
          </p>
        )}
      </Popover>
    </>
  )
}
