import { Activity, type ReactNode } from 'react'
import type { Tab } from './tabs-model'

type TabViewerProps = {
  tabs: Tab[]
  activeId: string
  renderTab: (tab: Tab) => ReactNode
  empty: ReactNode
}

// Keeps every open tab mounted; React <Activity> hides the inactive ones while
// preserving their state (scroll position, inputs, fetched data).
export const TabViewer = ({ tabs, activeId, renderTab, empty }: TabViewerProps) => {
  if (tabs.length === 0) return <>{empty}</>
  return (
    <div className="relative min-h-0 flex-1">
      {tabs.map(tab => (
        <Activity key={tab.id} mode={tab.id === activeId ? 'visible' : 'hidden'}>
          <div className="absolute inset-0 overflow-auto">{renderTab(tab)}</div>
        </Activity>
      ))}
    </div>
  )
}
