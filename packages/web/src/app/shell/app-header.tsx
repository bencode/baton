import type { Id } from '@baton/shared'
import type { Ref } from 'react'
import { MenuIcon } from '../../components/icons'
import { UserMenu } from '../../features/auth/user-menu'
import { ProjectSwitcher } from '../../features/projects/project-switcher'
import { WorkspaceSwitcher } from '../../features/workspaces/workspace-switcher'
import { HealthBadge } from './health-badge'

type AppHeaderProps = {
  workspaceId: Id | null
  projectId: Id | null
  onOpenMenu(): void
  menuButtonRef: Ref<HTMLButtonElement>
}

export const AppHeader = ({
  workspaceId,
  projectId,
  onOpenMenu,
  menuButtonRef,
}: AppHeaderProps) => (
  <header className="z-10 shrink-0 border-b border-ui-border bg-ui-surface px-3 md:flex md:h-[52px] md:items-center md:gap-4 md:px-4">
    <div className="flex h-[52px] min-w-0 items-center gap-3 md:flex-1">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onOpenMenu}
        aria-label="open menu"
        className="ui-icon-button md:hidden"
      >
        <MenuIcon />
      </button>
      <span className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-ui-text">
        <span className="h-2 w-2 rotate-45 bg-ui-accent" aria-hidden />
        baton
      </span>
      <span className="hidden h-4 w-px shrink-0 bg-ui-border sm:block" aria-hidden />
      <div className="min-w-0 max-w-56 flex-1">
        <WorkspaceSwitcher activeWorkspaceId={workspaceId} />
      </div>
      <div className="hidden min-w-0 max-w-64 flex-1 md:block">
        <ProjectSwitcher key={workspaceId} workspaceId={workspaceId} activeProjectId={projectId} />
      </div>
      <div className="ml-auto md:hidden">
        <UserMenu />
      </div>
    </div>
    <div className="hidden shrink-0 items-center gap-3 md:flex">
      <HealthBadge />
      <UserMenu />
    </div>
    <div className="pb-2 md:hidden">
      <ProjectSwitcher key={workspaceId} workspaceId={workspaceId} activeProjectId={projectId} />
    </div>
  </header>
)
