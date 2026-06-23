import type { Id } from '@baton/shared'
import { MenuIcon } from '../../components/icons'
import { UserMenu } from '../../features/auth/user-menu'
import { WorkspaceSwitcher } from '../../features/workspaces/workspace-switcher'
import { HealthBadge } from './health-badge'

type AppHeaderProps = { workspaceId: Id | null; onOpenMenu: () => void }

// The top bar: a phone-only menu toggle, the wordmark, the workspace switcher,
// and (right) the server health badge + user menu.
export const AppHeader = ({ workspaceId, onOpenMenu }: AppHeaderProps) => (
  <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="open menu"
        className="-ml-1 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 md:hidden"
      >
        <MenuIcon />
      </button>
      <h1 className="flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-gray-900">
        <span className="inline-block h-2 w-2 rotate-45 bg-emerald-500" aria-hidden />
        baton
      </h1>
      <span aria-hidden className="h-5 w-px bg-gray-200" />
      <WorkspaceSwitcher activeWorkspaceId={workspaceId} />
    </div>
    <div className="flex items-center gap-3">
      <span className="hidden sm:inline-flex">
        <HealthBadge />
      </span>
      <UserMenu />
    </div>
  </header>
)
