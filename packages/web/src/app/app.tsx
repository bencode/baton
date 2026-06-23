import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { createApi } from '../api'
import { OpsPage } from '../features/admin/ops-page'
import { LoginPage } from '../features/auth/login-page'
import { RequireAuth } from '../features/auth/require-auth'
import { ChannelPage } from '../features/channels/channel-page'
import { DingtalkHelpPage } from '../features/help/dingtalk-help-page'
import { SessionPage } from '../features/sessions/session-page'
import { useIsMobile } from '../hooks/use-media-query'
import { ApiContext } from './api-context'
import { LeftPanel } from './left-panel'
import { AppHeader } from './shell/app-header'
import { DetailPane } from './shell/detail-pane'
import { DesktopSplit, MobileMain } from './shell/layout'
import { useShellRouting } from './shell/use-shell-routing'
import { useTabs } from './tabs/use-tabs'

const api = createApi()

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
      <AppHeader workspaceId={workspaceId} onOpenMenu={() => setDrawerOpen(true)} />
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
