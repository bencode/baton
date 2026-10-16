import type { Id } from '@baton/shared'
import { ProjectSettings } from '../../features/projects/project-settings'
import { ServicesPanel } from '../../features/services/services-panel'
import { useSessions } from '../../features/sessions/use-sessions'
import { useWorkers } from '../../features/workers/use-workers'
import { WorkersPanel } from '../../features/workers/workers-panel'
import type { ProjectViewKind } from '../route'

type ProjectViewProps = {
  projectId: Id
  view: ProjectViewKind
  open(path: string, title: string): void
  onSessionsDeleted(projectId: Id, sessionIds: readonly Id[]): void
  onProjectDeleted(projectId: Id, fallbackPath: string): void
}

const WorkersView = ({
  projectId,
  open,
  onSessionsDeleted,
}: Omit<ProjectViewProps, 'view' | 'onProjectDeleted'>) => {
  const workers = useWorkers(projectId)
  const sessions = useSessions(projectId)
  return (
    <WorkersPanel
      feedback={
        <>
          {workers.loading && workers.data === null && (
            <p role="status" className="mg-feedback text-ui-muted">
              加载执行环境…
            </p>
          )}
          {(workers.error || sessions.error) && (
            <p role="alert" className="mg-feedback text-ui-danger">
              部分执行环境信息暂时无法刷新。{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  workers.refresh()
                  sessions.refresh()
                }}
              >
                重试
              </button>
            </p>
          )}
        </>
      }
      projectId={projectId}
      workers={workers.data}
      sessions={sessions.data}
      open={open}
      onSessionsDeleted={ids => {
        onSessionsDeleted(projectId, ids)
        workers.refresh()
        sessions.refresh()
      }}
    />
  )
}

const ServicesView = ({
  projectId,
  open,
}: {
  projectId: Id
  open(path: string, title: string): void
}) => {
  const { data: workers } = useWorkers(projectId)
  return <ServicesPanel projectId={projectId} workers={workers} activeId="" open={open} />
}

export const ProjectView = ({
  projectId,
  view,
  open,
  onSessionsDeleted,
  onProjectDeleted,
}: ProjectViewProps) => (
  <div className="h-full overflow-auto">
    <div className="ui-page mg-page">
      {view === 'settings' && (
        <header className="mg-page-header">
          <div>
            <h1>项目设置</h1>
            <p className="mg-description">管理当前项目的基本信息。</p>
          </div>
        </header>
      )}
      {view === 'workers' && (
        <WorkersView projectId={projectId} open={open} onSessionsDeleted={onSessionsDeleted} />
      )}
      {view === 'services' && <ServicesView projectId={projectId} open={open} />}
      {view === 'settings' && (
        <ProjectSettings projectId={projectId} onDeleted={onProjectDeleted} />
      )}
    </div>
  </div>
)
