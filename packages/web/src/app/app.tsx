import { useEffect, useRef, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { createApi } from '../api'
import { OpsPage } from '../features/admin/ops-page'
import { LoginPage } from '../features/auth/login-page'
import { RequireAuth } from '../features/auth/require-auth'
import { ChannelPage } from '../features/channels/channel-page'
import { DingtalkHelpPage } from '../features/help/dingtalk-help-page'
import { InstallBanner } from '../features/install/install-banner'
import { NewSessionDialog } from '../features/sessions/new-session-dialog'
import { SessionPage } from '../features/sessions/session-page'
import { useIsMobile } from '../hooks/use-media-query'
import { ApiContext } from './api-context'
import { LeftPanel } from './left-panel'
import { parseRoute, projectViewPath, sessionPath } from './route'
import { CompactHeader, NavMenuButton } from './shell/app-header'
import { DetailPane } from './shell/detail-pane'
import { DesktopSplit, MobileMain } from './shell/layout'
import { useShellRouting } from './shell/use-shell-routing'
import { useTabs } from './tabs/use-tabs'

const api = createApi()

export const Shell = () => {
  const { tabs, activeId, open, close, closeOthers, closeRight, closeAll, closeMatching, retitle } =
    useTabs()
  const { routeProjectId, workspaceId } = useShellRouting({ activeId, tabs, retitle })
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [newSessionProject, setNewSessionProject] = useState<number | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const newSessionTrigger = useRef<HTMLElement | null>(null)
  useEffect(() => {
    setNewSessionProject(current => (current === routeProjectId ? current : null))
  }, [routeProjectId])
  const startSession = () => {
    if (routeProjectId === null) return
    newSessionTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDrawerOpen(false)
    setNewSessionProject(routeProjectId)
  }
  const dismissSession = () => {
    setNewSessionProject(null)
    if (newSessionTrigger.current?.isConnected) newSessionTrigger.current.focus()
    else menuButton.current?.focus()
  }
  // Opening a rail item navigates and (on mobile) dismisses the drawer; a no-op
  // close on desktop where the drawer is never shown.
  const openItem = (id: string, title: string) => {
    open(id, title)
    setDrawerOpen(false)
  }
  const left = (
    <LeftPanel
      key={routeProjectId}
      onNewSession={startSession}
      onCollapse={() => (isMobile ? setDrawerOpen(false) : setDesktopCollapsed(true))}
      onContextNavigate={() => setDrawerOpen(false)}
      workspaceId={workspaceId}
      projectId={routeProjectId}
      activeId={activeId}
      open={openItem}
      close={close}
    />
  )
  const openMenu = () => (isMobile ? setDrawerOpen(true) : setDesktopCollapsed(false))
  // Phones fold the project header into the tab strip to leave room for reading;
  // with no tabs open the strip is gone, so the header keeps the drawer reachable.
  const mergeHeader = isMobile && tabs.length > 0
  const detail = (
    <DetailPane
      header={
        !mergeHeader && (isMobile || desktopCollapsed) ? (
          <CompactHeader
            projectId={routeProjectId}
            menuButtonRef={menuButton}
            onOpenMenu={openMenu}
          />
        ) : null
      }
      tabsLeading={
        mergeHeader ? (
          <NavMenuButton
            menuButtonRef={menuButton}
            onOpenMenu={openMenu}
            className="ui-icon-button wb-tab-menu"
          />
        ) : null
      }
      tabs={tabs}
      onNewSession={startSession}
      onSessionsDeleted={(projectId, ids) =>
        closeMatching(tab => ids.some(id => tab.id === sessionPath(projectId, id)))
      }
      onProjectDeleted={(projectId, fallbackPath) =>
        closeMatching(tab => {
          const route = parseRoute(tab.id)
          return 'projectId' in route && route.projectId === projectId
        }, fallbackPath)
      }
      activeId={activeId}
      open={open}
      close={close}
      closeOthers={closeOthers}
      closeRight={closeRight}
      closeAll={closeAll}
    />
  )
  return (
    <div className="wb-shell">
      {newSessionProject !== null && newSessionProject === routeProjectId && (
        <NewSessionDialog
          key={newSessionProject}
          projectId={newSessionProject}
          onClose={dismissSession}
          onCreated={session => {
            setNewSessionProject(null)
            openItem(sessionPath(newSessionProject, session.id), session.name)
          }}
          onManageWorkers={() => {
            setNewSessionProject(null)
            openItem(projectViewPath(newSessionProject, 'workers'), '执行环境')
          }}
        />
      )}
      <DesktopSplit
        left={isMobile ? null : left}
        detail={detail}
        isMobile={isMobile}
        collapsed={desktopCollapsed}
      />
      {isMobile && (
        <MobileMain
          left={left}
          drawerOpen={drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
        />
      )}
      {isMobile && <InstallBanner />}
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
      {/* Public chat room (capability token in the URL hash); no login, like /s. */}
      <Route path="/channel/:id" element={<ChannelPage />} />
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
