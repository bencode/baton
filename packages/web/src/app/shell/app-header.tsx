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
  <header className="z-10 shrink-0 border-b border-ui-border bg-ui-surface px-3 md:flex md:h-12 md:items-center md:gap-3 md:px-4">
    <div className="flex h-12 min-w-0 items-center gap-2 md:flex-1 md:gap-0">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onOpenMenu}
        aria-label="open menu"
        className="ui-icon-button md:hidden"
      >
        <MenuIcon />
      </button>
      <span className="flex shrink-0 items-center gap-2 text-[17px] font-semibold tracking-tight text-ui-heading md:mr-6">
        <span className="h-2 w-2 rotate-45 bg-ui-accent" aria-hidden />
        baton
      </span>
      <div className="min-w-0 max-w-56 flex-1 md:flex-initial">
        <WorkspaceSwitcher activeWorkspaceId={workspaceId} />
      </div>
      <div className="hidden min-w-0 max-w-64 md:ml-3 md:block">
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
    <div className="flex h-12 items-center md:hidden">
      <ProjectSwitcher key={workspaceId} workspaceId={workspaceId} activeProjectId={projectId} />
    </div>
  </header>
)
