import { useEffect, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { useNavigate } from 'react-router-dom'
import { createApi } from '../api.ts'
import { useProject, useProjects } from '../features/projects/use-projects.ts'
import { RequirementDetail } from '../features/requirements/requirement-detail.tsx'
import { TaskDetail } from '../features/tasks/task-detail.tsx'
import { useWorkspaces } from '../features/workspaces/use-workspaces.ts'
import { WorkspaceSwitcher } from '../features/workspaces/workspace-switcher.tsx'
import { ApiContext, useApi } from './api-context.ts'
import { LeftPanel } from './left-panel.tsx'
import { activeProjectId, parseRoute, projectPath, workspacePath } from './route.ts'
import { TabBar } from './tabs/tab-bar.tsx'
import { TabViewer } from './tabs/tab-viewer.tsx'
import type { Tab } from './tabs/tabs-model.ts'
import { useTabs } from './tabs/use-tabs.ts'

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
    <span className="inline-flex items-center gap-2 text-sm text-gray-600">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {`server: ${health}`}
    </span>
  )
}

// Dispatch a tab's path to its detail view (read-only for now).
const renderTab = (tab: Tab) => {
  const route = parseRoute(tab.id)
  if (route.kind === 'requirement') return <RequirementDetail requirementId={route.requirementId} />
  if (route.kind === 'task') return <TaskDetail taskId={route.taskId} />
  return null
}

const EmptyMain = () => (
  <div className="flex h-full items-center justify-center text-sm text-gray-400">
    Select a requirement or task to open it.
  </div>
)

export const Shell = () => {
  const navigate = useNavigate()
  const { tabs, activeId, open, close } = useTabs()
  const route = parseRoute(activeId)
  const routeProjectId = activeProjectId(activeId)
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
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-lg font-semibold">baton</h1>
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
          />
        </Panel>
        <Separator className="w-px bg-gray-200 transition-colors hover:bg-blue-400" />
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

export const App = () => (
  <ApiContext.Provider value={api}>
    <Shell />
  </ApiContext.Provider>
)
