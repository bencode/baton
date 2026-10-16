import type { Id } from '@baton/shared'
import { Activity, type ReactNode, useEffect, useState } from 'react'
import { ServiceIcon, SettingsIcon, WorkerIcon } from '../components/icons'
import { UserMenu } from '../features/auth/user-menu'
import { SessionsPanel } from '../features/sessions/sessions-panel'
import { WorkspaceSwitcher } from '../features/workspaces/workspace-switcher'
import { type ProjectViewKind, parseRoute, projectViewPath } from './route'
import { SidebarHeader } from './shell/app-header'
import { HealthBadge } from './shell/health-badge'
import { WorkItemsPanel } from './work-items-panel'

type Section = 'sessions' | 'requirements'
type LeftPanelProps = {
  workspaceId: Id | null
  projectId: Id | null
  activeId: string
  open(path: string, title: string): void
  close(path: string): void
  onNewSession(): void
  onCollapse(): void
  onContextNavigate(): void
}
const NavigationToolbar = ({
  section,
  onChange,
  actions,
}: {
  section: Section
  onChange(section: Section): void
  actions?: ReactNode
}) => (
  <div className="wb-navigation-toolbar">
    <fieldset className="wb-categories" aria-label="项目内容">
      <button
        type="button"
        aria-pressed={section === 'sessions'}
        onClick={() => onChange('sessions')}
      >
        会话
      </button>
      <button
        type="button"
        aria-label="需求与任务"
        aria-pressed={section === 'requirements'}
        onClick={() => onChange('requirements')}
      >
        工作项
      </button>
    </fieldset>
    {actions}
  </div>
)

export const LeftPanel = ({
  workspaceId,
  projectId,
  activeId,
  open,
  close,
  onNewSession,
  onCollapse,
  onContextNavigate,
}: LeftPanelProps) => {
  const [section, setSection] = useState<Section>('sessions')
  useEffect(() => {
    const route = parseRoute(activeId)
    if (route.kind === 'item') setSection('requirements')
    if (route.kind === 'session') setSection('sessions')
  }, [activeId])
  const entries: { view: ProjectViewKind; label: string; icon: typeof WorkerIcon }[] = [
    { view: 'workers', label: '执行环境', icon: WorkerIcon },
    { view: 'services', label: '服务', icon: ServiceIcon },
    { view: 'settings', label: '项目设置', icon: SettingsIcon },
  ]
  return (
    <aside aria-label="项目导航" className="wb-sidebar">
      <SidebarHeader
        workspaceId={workspaceId}
        projectId={projectId}
        onCollapse={onCollapse}
        onNavigate={onContextNavigate}
      />
      {projectId === null ? (
        <p className="min-h-0 flex-1 px-3 py-4 text-xs text-ui-muted">请选择或创建项目。</p>
      ) : (
        <>
          <div className="wb-navigation-body">
            <Activity mode={section === 'sessions' ? 'visible' : 'hidden'}>
              <SessionsPanel
                projectId={projectId}
                activeId={activeId}
                open={open}
                close={close}
                onNewSession={onNewSession}
                renderToolbar={actions => (
                  <NavigationToolbar section={section} onChange={setSection} actions={actions} />
                )}
              />
            </Activity>
            <Activity mode={section === 'requirements' ? 'visible' : 'hidden'}>
              <div className="wb-category-panel">
                <NavigationToolbar section={section} onChange={setSection} />
                <div className="wb-work-items">
                  <WorkItemsPanel projectId={projectId} activeId={activeId} open={open} />
                </div>
              </div>
            </Activity>
          </div>
          <nav aria-label="项目管理" className="wb-management">
            {entries.map(entry => {
              const path = projectViewPath(projectId, entry.view)
              return (
                <button
                  key={entry.view}
                  type="button"
                  onClick={() => open(path, entry.label)}
                  aria-current={activeId === path ? 'page' : undefined}
                  className="ui-nav-item"
                >
                  <entry.icon />
                  {entry.label}
                </button>
              )
            })}
          </nav>
        </>
      )}
      <div className="wb-account-footer">
        <UserMenu
          context={
            <>
              <WorkspaceSwitcher activeWorkspaceId={workspaceId} onNavigate={onContextNavigate} />
              <HealthBadge />
            </>
          }
        />
      </div>
    </aside>
  )
}
