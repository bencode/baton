import type { Id } from '@baton/shared'
import { RequirementDetail } from '../../features/requirements/requirement-detail'
import { ServiceDetail } from '../../features/services/service-detail'
import { SessionDetail } from '../../features/sessions/session-detail'
import { TaskDetail } from '../../features/tasks/task-detail'
import { activeProjectId, parseRoute, projectViewPath } from '../route'
import { TabBar } from '../tabs/tab-bar'
import { TabViewer } from '../tabs/tab-viewer'
import type { Tab } from '../tabs/tabs-model'
import { ProjectView } from './project-view'

type DetailPaneProps = {
  tabs: Tab[]
  activeId: string
  open(path: string, title: string): void
  close(path: string): void
  closeOthers(path: string): void
  closeRight(path: string): void
  closeAll(): void
  onNewSession(): void
  onSessionsDeleted(projectId: Id, sessionIds: readonly Id[]): void
  onProjectDeleted(projectId: Id, fallbackPath: string): void
}

const renderTab = (tab: Tab, props: DetailPaneProps) => {
  const route = parseRoute(tab.id)
  if (route.kind === 'project-view')
    return (
      <ProjectView
        projectId={route.projectId}
        view={route.view}
        open={props.open}
        onSessionsDeleted={props.onSessionsDeleted}
        onProjectDeleted={props.onProjectDeleted}
      />
    )
  if (route.kind === 'session') return <SessionDetail sessionId={route.sessionId} />
  if (route.kind === 'service')
    return <ServiceDetail projectId={route.projectId} workerId={route.workerId} name={route.name} />
  if (route.kind !== 'item') return null
  if (route.itemKind === 'requirement')
    return <RequirementDetail projectId={route.projectId} code={route.code} />
  return <TaskDetail projectId={route.projectId} code={route.code} />
}

const ProjectStart = ({
  activeId,
  onNewSession,
  open,
}: Pick<DetailPaneProps, 'activeId' | 'onNewSession' | 'open'>) => {
  const projectId = activeProjectId(activeId)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span aria-hidden className="mb-1 h-3 w-3 rotate-45 bg-ui-accent" />
      <h1 className="text-xl font-semibold text-ui-text">
        {projectId === null ? 'Choose your project' : 'What would you like to work on?'}
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-ui-muted">
        {projectId === null
          ? 'Select or create a project above to get started.'
          : 'Start a conversation, or pick one from the sidebar to continue.'}
      </p>
      {projectId !== null && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onNewSession} className="ui-button ui-primary">
            New conversation
          </button>
          <button
            type="button"
            onClick={() => open(projectViewPath(projectId, 'workers'), 'Workers')}
            className="ui-button"
          >
            Manage workers
          </button>
        </div>
      )}
    </div>
  )
}

export const DetailPane = (props: DetailPaneProps) => (
  <main className="flex h-full min-w-0 flex-col bg-ui-surface">
    <TabBar
      tabs={props.tabs}
      activeId={props.activeId}
      onSelect={id => props.open(id, props.tabs.find(tab => tab.id === id)?.title ?? id)}
      onClose={props.close}
      onCloseOthers={props.closeOthers}
      onCloseRight={props.closeRight}
      onCloseAll={props.closeAll}
    />
    <TabViewer
      tabs={props.tabs}
      activeId={props.activeId}
      renderTab={tab => renderTab(tab, props)}
      empty={
        <ProjectStart
          activeId={props.activeId}
          open={props.open}
          onNewSession={props.onNewSession}
        />
      }
    />
  </main>
)
