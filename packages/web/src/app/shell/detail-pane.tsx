import { RequirementDetail } from '../../features/requirements/requirement-detail'
import { SessionDetail } from '../../features/sessions/session-detail'
import { TaskDetail } from '../../features/tasks/task-detail'
import { parseRoute } from '../route'
import { TabBar } from '../tabs/tab-bar'
import { TabViewer } from '../tabs/tab-viewer'
import type { Tab } from '../tabs/tabs-model'

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
export const DetailPane = ({
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
