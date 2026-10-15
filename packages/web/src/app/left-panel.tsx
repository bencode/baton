import type { Id } from '@baton/shared'
import { Activity, useEffect, useState } from 'react'
import { PencilIcon, ServiceIcon, SettingsIcon, WorkerIcon } from '../components/icons'
import { ChannelsPanel } from '../features/channels/channels-panel'
import { useRequirements } from '../features/requirements/use-requirements'
import { SessionsPanel } from '../features/sessions/sessions-panel'
import { usePersistedSet } from '../hooks/use-persisted-set'
import { RequirementTree } from './requirement-tree'
import { type ProjectViewKind, parseRoute, projectViewPath } from './route'

type LeftPanelProps = {
  workspaceId: Id | null
  projectId: Id | null
  activeId: string
  open(path: string, title: string): void
  close(path: string): void
  onNewSession(): void
}

const RequirementsList = ({
  projectId,
  activeId,
  open,
}: {
  projectId: Id
  activeId: string
  open(path: string, title: string): void
}) => {
  const { data: requirements, loading, error } = useRequirements(projectId)
  const collapsed = usePersistedSet('baton.req.collapsed')
  return (
    <>
      {loading && !requirements && (
        <p role="status" className="px-2 text-sm text-ui-muted">
          Loading requirements…
        </p>
      )}
      {error && (
        <p role="alert" className="px-2 text-sm text-ui-danger">
          Unable to load requirements.
        </p>
      )}
      {!loading && !error && requirements?.length === 0 && (
        <p className="px-2 text-sm text-ui-muted">No requirements yet.</p>
      )}
      {requirements?.map(requirement => (
        <RequirementTree
          key={requirement.id}
          requirement={requirement}
          projectId={projectId}
          activeId={activeId}
          expanded={!collapsed.has(String(requirement.id))}
          onToggle={() => collapsed.toggle(String(requirement.id))}
          open={open}
        />
      ))}
    </>
  )
}

export const LeftPanel = ({
  workspaceId,
  projectId,
  activeId,
  open,
  close,
  onNewSession,
}: LeftPanelProps) => {
  const [section, setSection] = useState<'sessions' | 'requirements'>('sessions')
  useEffect(() => {
    const route = parseRoute(activeId)
    if (route.kind === 'item') setSection('requirements')
    if (route.kind === 'session') setSection('sessions')
  }, [activeId])
  const entries: { view: ProjectViewKind; label: string; icon: typeof WorkerIcon }[] = [
    { view: 'workers', label: 'Workers', icon: WorkerIcon },
    { view: 'services', label: 'Services', icon: ServiceIcon },
    { view: 'settings', label: 'Project settings', icon: SettingsIcon },
  ]
  return (
    <aside
      aria-label="Project navigation"
      className="flex h-full min-h-0 flex-col bg-ui-panel text-ui-text"
    >
      <div className="shrink-0 px-3 pt-4 pb-3">
        <button
          type="button"
          disabled={projectId === null}
          onClick={onNewSession}
          className="ui-button ui-primary w-full justify-start px-3"
        >
          <PencilIcon /> New conversation
        </button>
      </div>
      {projectId === null ? (
        <p className="min-h-0 flex-1 px-5 text-sm text-ui-muted">Select a project.</p>
      ) : (
        <>
          <fieldset
            className="mx-3 mb-3 flex shrink-0 gap-4 border-b border-ui-border px-2"
            aria-label="Resource categories"
          >
            <button
              type="button"
              aria-pressed={section === 'sessions'}
              onClick={() => setSection('sessions')}
              className={`ui-focus min-h-11 min-w-0 border-b-2 py-2 text-xs md:min-h-8 [@media(pointer:coarse)]:min-h-11 ${section === 'sessions' ? 'border-ui-accent font-medium text-ui-accent' : 'border-transparent text-ui-muted'}`}
            >
              Conversations
            </button>
            <button
              type="button"
              aria-label="Requirements / tasks"
              title="Requirements and tasks"
              aria-pressed={section === 'requirements'}
              onClick={() => setSection('requirements')}
              className={`ui-focus min-h-11 min-w-0 border-b-2 py-2 text-xs md:min-h-8 [@media(pointer:coarse)]:min-h-11 ${section === 'requirements' ? 'border-ui-accent font-medium text-ui-accent' : 'border-transparent text-ui-muted'}`}
            >
              Work items
            </button>
          </fieldset>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <Activity mode={section === 'sessions' ? 'visible' : 'hidden'}>
              <SessionsPanel projectId={projectId} activeId={activeId} open={open} close={close} />
            </Activity>
            <Activity mode={section === 'requirements' ? 'visible' : 'hidden'}>
              <RequirementsList projectId={projectId} activeId={activeId} open={open} />
            </Activity>
          </div>
          <nav
            aria-label="Project management"
            className="mx-3 shrink-0 border-t border-ui-border py-3"
          >
            {entries.map(entry => {
              const path = projectViewPath(projectId, entry.view)
              return (
                <button
                  key={entry.view}
                  type="button"
                  onClick={() => open(path, entry.label)}
                  aria-current={activeId === path ? 'page' : undefined}
                  className={`ui-nav-item ${activeId === path ? 'bg-ui-selected font-medium text-ui-selected-text' : 'text-ui-muted'}`}
                >
                  <entry.icon />
                  {entry.label}
                </button>
              )
            })}
          </nav>
        </>
      )}
      {workspaceId !== null && (
        <div className="mx-3 max-h-[30%] shrink-0 overflow-y-auto border-t border-ui-border py-3">
          <ChannelsPanel key={workspaceId} workspaceId={workspaceId} />
        </div>
      )}
    </aside>
  )
}
