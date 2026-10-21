import type { Id } from '@baton/shared'
import type { Ref } from 'react'
import { BatonIcon, PanelIcon } from '../../components/icons'
import { ProjectSwitcher } from '../../features/projects/project-switcher'
import { useProject } from '../../features/projects/use-projects'

export const SidebarHeader = ({
  workspaceId,
  projectId,
  onCollapse,
  onNavigate,
}: {
  workspaceId: Id | null
  projectId: Id | null
  onCollapse(): void
  onNavigate(): void
}) => (
  <div className="wb-sidebar-header">
    <span className="wb-brand-mark" role="img" aria-label="baton">
      <BatonIcon />
    </span>
    <ProjectSwitcher
      key={workspaceId}
      workspaceId={workspaceId}
      activeProjectId={projectId}
      onNavigate={onNavigate}
    />
    <button
      type="button"
      onClick={onCollapse}
      className="ui-icon-button"
      aria-label="收起导航"
      title="收起导航"
    >
      <PanelIcon />
    </button>
  </div>
)

type MenuButtonProps = {
  menuButtonRef: Ref<HTMLButtonElement>
  onOpenMenu(): void
}

export const NavMenuButton = ({
  menuButtonRef,
  onOpenMenu,
  className = 'ui-icon-button',
}: MenuButtonProps & { className?: string }) => (
  <button
    ref={menuButtonRef}
    type="button"
    onClick={onOpenMenu}
    className={className}
    aria-label="打开导航"
    title="打开导航"
  >
    <PanelIcon />
  </button>
)

export const CompactHeader = ({
  projectId,
  ...menu
}: MenuButtonProps & {
  projectId: Id | null
}) => {
  const { data: project } = useProject(projectId)
  return (
    <header className="wb-compact-header">
      <NavMenuButton {...menu} />
      <span className="min-w-0 truncate">
        {project?.id === projectId ? project.name : '选择项目'}
      </span>
      <span className="ml-auto text-ui-muted">baton</span>
    </header>
  )
}
