import { useProject } from '../../features/projects/use-projects'
import { activeProjectId as projectFromPath } from '../route'
import type { Tab } from './tabs-model'

const ProjectPrefix = ({ projectId }: { projectId: number }) => {
  const { data } = useProject(projectId)
  return (
    <span className="text-ui-muted">
      {data?.id === projectId ? data.name : `P-${projectId}`} ·{' '}
    </span>
  )
}

export const ProjectTabLabel = ({
  tab,
  activeProjectId,
}: {
  tab: Tab
  activeProjectId: number | null
}) => {
  const projectId = projectFromPath(tab.id)
  return (
    <>
      {projectId !== null && projectId !== activeProjectId && (
        <ProjectPrefix projectId={projectId} />
      )}
      {tab.title}
    </>
  )
}
