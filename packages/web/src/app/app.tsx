import { useEffect, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { createApi } from '../api'
import { LoginPage } from '../features/auth/login-page'
import { RequireAuth } from '../features/auth/require-auth'
import { DingtalkHelpPage } from '../features/help/dingtalk-help-page'
import { useProject, useProjects } from '../features/projects/use-projects'
import { RequirementDetail } from '../features/requirements/requirement-detail'
import { SessionDetail } from '../features/sessions/session-detail'
import { SessionPage } from '../features/sessions/session-page'
import { useSessions } from '../features/sessions/use-sessions'
import { TaskDetail } from '../features/tasks/task-detail'
import { useWorkspaces } from '../features/workspaces/use-workspaces'
import { WorkspaceSwitcher } from '../features/workspaces/workspace-switcher'
import { ApiContext, useApi } from './api-context'
import { LeftPanel } from './left-panel'
import { activeProjectId, parseRoute, projectPath, workspacePath } from './route'
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

export const Shell = () => {
  const navigate = useNavigate()
  const { tabs, activeId, open, close, retitle } = useTabs()
  const route = parseRoute(activeId)
  const routeProjectId = activeProjectId(activeId)
  // Keep session tab labels in sync with the live (auto-titled/renamed) name.
  const { data: sessions } = useSessions(routeProjectId)
  useEffect(() => {
    if (!sessions) return
    for (const tab of tabs) {
      const r = parseRoute(tab.id)
      if (r.kind !== 'session') continue
      const s = sessions.find(x => x.id === r.sessionId)
      if (s && s.name !== tab.title) retitle(tab.id, s.name)
    }
  }, [sessions, tabs, retitle])
  const routeWorkspaceId = route.kind === 'workspace' ? route.workspaceId : null
  const { data: project } = useProject(routeProjectId)
  const { data: workspaces } = useWorkspaces()
  const { data: wsProjects } = useProjects(routeWorkspaceId)
  const workspaceId = project?.workspaceId ?? routeWorkspaceId

  // Redirect: home → first workspace; a bare workspace → its first project.
  useEffect(() => {
    const first = workspaces?.[0]
    if (route.kind === 'home' && first) navigate(workspacePath(first.id), { replace: true })
  }, [route.kind, workspaces, navigate])
  useEffect(() => {
    const first = wsProjects?.[0]
    if (route.kind === 'workspace' && first) navigate(projectPath(first.id), { replace: true })
  }, [route.kind, wsProjects, navigate])

  const layout = useDefaultLayout({
    id: 'baton-main-split',
    panelIds: PANEL_IDS,
    storage: localStorage,
  })
  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-gray-900">
            <span className="inline-block h-2 w-2 rotate-45 bg-emerald-500" aria-hidden />
            baton
          </h1>
          <span aria-hidden className="h-5 w-px bg-gray-200" />
          <WorkspaceSwitcher activeWorkspaceId={workspaceId} />
        </div>
        <HealthBadge />
      </header>
      <Group
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <Panel id="resources" defaultSize="22%" minSize="1%" maxSize="50%">
          <LeftPanel
            workspaceId={workspaceId}
            projectId={routeProjectId}
            activeId={activeId}
            open={open}
            close={close}
          />
        </Panel>
        <Separator className="w-px bg-gray-200 transition-colors hover:bg-gray-300" />
        <Panel id="detail" minSize="1%">
          <div className="flex h-full flex-col bg-white">
            <TabBar
              tabs={tabs}
              activeId={activeId}
              onSelect={id => open(id, tabs.find(t => t.id === id)?.title ?? id)}
              onClose={close}
            />
            <TabViewer
              tabs={tabs}
              activeId={activeId}
              renderTab={renderTab}
              empty={<EmptyMain />}
            />
          </div>
        </Panel>
      </Group>
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
