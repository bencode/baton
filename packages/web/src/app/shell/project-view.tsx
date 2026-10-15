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
    <>
      <p className="mb-6 text-sm text-ui-muted">
        Workers provide the agent and execution environment for your conversations.
      </p>
      {(workers.error || sessions.error) && (
        <p role="alert" className="mb-4 text-sm text-ui-danger">
          Some worker information could not be refreshed.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              workers.refresh()
              sessions.refresh()
            }}
          >
            Retry
          </button>
        </p>
      )}
      <WorkersPanel
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
    </>
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
    <div className="ui-page">
      {view !== 'services' && (
        <h1 className="ui-page-title mb-2">
          {view === 'workers' ? 'Workers' : 'Project settings'}
        </h1>
      )}
      {view === 'workers' && (
        <WorkersView projectId={projectId} open={open} onSessionsDeleted={onSessionsDeleted} />
      )}
      {view === 'services' && <ServicesView projectId={projectId} open={open} />}
      {view === 'settings' && (
        <div className="mt-6">
          <ProjectSettings projectId={projectId} onDeleted={onProjectDeleted} />
        </div>
      )}
    </div>
  </div>
)
