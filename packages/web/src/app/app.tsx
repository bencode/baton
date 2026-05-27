import { useEffect, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { createApi } from '../api.ts'
import { ApiContext, useApi } from './api-context.ts'
import { DemoTab, EmptyMain, LeftPlaceholder } from './placeholder.tsx'
import { TabBar } from './tabs/tab-bar.tsx'
import { TabViewer } from './tabs/tab-viewer.tsx'
import { useTabs } from './tabs/use-tabs.ts'

const api = createApi()

const PANEL_IDS = ['resources', 'detail']

// Demo routing convention: a tab route is /t/<key>; '/' opens no tab.
const titleForPath = (path: string): string | null =>
  path.startsWith('/t/') ? decodeURIComponent(path.slice(3)) : null

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

export const Shell = () => {
  const { tabs, activeId, open, close } = useTabs(titleForPath)
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
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            workspace ▾
          </button>
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
          <LeftPlaceholder onOpen={open} />
        </Panel>
        <Separator className="w-px bg-gray-200 transition-colors hover:bg-blue-400" />
        <Panel id="detail" minSize="1%">
          <div className="flex h-full flex-col bg-white">
            <TabBar tabs={tabs} activeId={activeId} onSelect={open} onClose={close} />
            <TabViewer
              tabs={tabs}
              activeId={activeId}
              renderTab={tab => <DemoTab title={tab.title} />}
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
