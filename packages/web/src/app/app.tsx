import { type ReactNode, useEffect, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { Route, Routes } from 'react-router-dom'
import { createApi } from '../api'
import { MenuIcon } from '../components/icons'
import { OpsPage } from '../features/admin/ops-page'
import { LoginPage } from '../features/auth/login-page'
import { RequireAuth } from '../features/auth/require-auth'
import { UserMenu } from '../features/auth/user-menu'
import { DingtalkHelpPage } from '../features/help/dingtalk-help-page'
import { RequirementDetail } from '../features/requirements/requirement-detail'
import { SessionDetail } from '../features/sessions/session-detail'
import { SessionPage } from '../features/sessions/session-page'
import { TaskDetail } from '../features/tasks/task-detail'
import { WorkspaceSwitcher } from '../features/workspaces/workspace-switcher'
import { useIsMobile } from '../hooks/use-media-query'
import { ApiContext, useApi } from './api-context'
import { LeftPanel } from './left-panel'
import { MobileDrawer } from './mobile-drawer'
import { parseRoute } from './route'
import { useShellRouting } from './shell/use-shell-routing'
import { TabBar } from './tabs/tab-bar'
import { TabViewer } from './tabs/tab-viewer'
import type { Tab } from './tabs/tabs-model'
import { useTabs } from './tabs/use-tabs'

const api = createApi()
const PANEL_IDS = ['resources', 'detail']

type Health = 'checking' | 'ok' | 'unreachable'

// Probes GET /health to prove the UI → Vite proxy → server chain is wired.
export const HealthBadge = () => {
  const client = useApi()
  const [health, setHealth] = useState<Health>('checking')
  useEffect(() => {
    let alive = true
    client
      .health()
      .then(() => alive && setHealth('ok'))
      .catch(() => alive && setHealth('unreachable'))
    return () => {
      alive = false
    }
  }, [client])
  const dot =
    health === 'ok' ? 'bg-green-500' : health === 'unreachable' ? 'bg-red-500' : 'bg-gray-400'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {`server: ${health}`}
    </span>
  )
}

// Dispatch a tab's path to its detail view. R-/T- ride the code-based item
// route; sessions navigate by int id under /proj/<p>/session/<sid>.
const renderTab = (tab: Tab) => {
  const route = parseRoute(tab.id)
  if (route.kind === 'session') return <SessionDetail sessionId={route.sessionId} />
  if (route.kind !== 'item') return null
  if (route.itemKind === 'requirement')
    return <RequirementDetail projectId={route.projectId} code={route.code} />
  if (route.itemKind === 'task') return <TaskDetail projectId={route.projectId} code={route.code} />
  return null
}

const EmptyMain = () => (
  <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
    <p className="text-sm text-gray-500">Nothing open.</p>
    <p className="text-xs text-gray-400">Pick a requirement or task from the left to begin.</p>
  </div>
)

type DetailPaneProps = {
  tabs: Tab[]
  activeId: string
  open: (id: string, title: string) => void
  close: (id: string) => void
  closeOthers: (id: string) => void
  closeRight: (id: string) => void
  closeAll: () => void
}

// The right-hand side (tab strip + active view), shared verbatim by the desktop
// split and the mobile single column.
const DetailPane = ({
  tabs,
  activeId,
  open,
  close,
  closeOthers,
  closeRight,
  closeAll,
}: DetailPaneProps) => (
  <div className="flex h-full flex-col bg-white">
    <TabBar
      tabs={tabs}
      activeId={activeId}
      onSelect={id => open(id, tabs.find(t => t.id === id)?.title ?? id)}
      onClose={close}
      onCloseOthers={closeOthers}
      onCloseRight={closeRight}
      onCloseAll={closeAll}
    />
    <TabViewer tabs={tabs} activeId={activeId} renderTab={renderTab} empty={<EmptyMain />} />
  </div>
)

// Desktop: the resizable two-pane split. useDefaultLayout lives here so its
// stored layout is only read when this pane is actually mounted — phones skip it.
const DesktopSplit = ({ left, detail }: { left: ReactNode; detail: ReactNode }) => {
  const layout = useDefaultLayout({
    id: 'baton-main-split',
    panelIds: PANEL_IDS,
    storage: localStorage,
  })
  return (
    <Group
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <Panel id="resources" defaultSize="22%" minSize="1%" maxSize="50%">
        {left}
      </Panel>
      <Separator className="w-px bg-gray-200 transition-colors hover:bg-gray-300" />
      <Panel id="detail" minSize="1%">
        {detail}
      </Panel>
    </Group>
  )
}

// Phone: single column with the rail tucked behind a slide-in drawer.
const MobileMain = ({
  left,
  detail,
  drawerOpen,
  onCloseDrawer,
}: {
  left: ReactNode
  detail: ReactNode
  drawerOpen: boolean
  onCloseDrawer: () => void
}) => (
  <div className="relative min-h-0 flex-1">
    {detail}
    <MobileDrawer open={drawerOpen} onClose={onCloseDrawer}>
      {left}
    </MobileDrawer>
  </div>
)

export const Shell = () => {
  const { tabs, activeId, open, close, closeOthers, closeRight, closeAll, retitle } = useTabs()
  const { routeProjectId, workspaceId } = useShellRouting({ activeId, tabs, retitle })
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Opening a rail item navigates and (on mobile) dismisses the drawer; a no-op
  // close on desktop where the drawer is never shown.
  const openItem = (id: string, title: string) => {
    open(id, title)
    setDrawerOpen(false)
  }
  const left = (
    <LeftPanel
      workspaceId={workspaceId}
      projectId={routeProjectId}
      activeId={activeId}
      open={openItem}
      close={close}
    />
  )
  const detail = (
    <DetailPane
      tabs={tabs}
      activeId={activeId}
      open={open}
      close={close}
      closeOthers={closeOthers}
      closeRight={closeRight}
      closeAll={closeAll}
    />
  )
  return (
    <div className="flex h-dvh flex-col bg-gray-50 text-gray-900">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
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
      {isMobile ? (
        <MobileMain
          left={left}
          detail={detail}
          drawerOpen={drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
        />
      ) : (
        <DesktopSplit left={left} detail={detail} />
      )}
    </div>
  )
}

// `/s/:token` is the standalone session page (a DingTalk share link, etc.): it
// auto-logs-in with the token, then renders the same SessionDetail without the
// shell. `/login` is the gate's redirect target. Everything else is the Shell,
// guarded by RequireAuth (a no-op when auth is off — no users seeded).
export const App = () => (
  <ApiContext.Provider value={api}>
    <Routes>
      <Route path="/s/:token" element={<SessionPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/help/dingtalk" element={<DingtalkHelpPage />} />
      {/* Admin ops board — full-bleed (no Shell); the server 403s non-admins. */}
      <Route
        path="/ops"
        element={
          <RequireAuth>
            <OpsPage />
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      />
    </Routes>
  </ApiContext.Provider>
)
