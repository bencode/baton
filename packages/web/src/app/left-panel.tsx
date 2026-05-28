import { ProjectSwitcher } from '../features/projects/project-switcher.tsx'
import { useRequirements } from '../features/requirements/use-requirements.ts'
import { RequirementTree } from './requirement-tree.tsx'

type LeftPanelProps = {
  workspaceId: string | null
  projectId: string | null
  activeId: string
  open: (id: string, title: string) => void
}

export const LeftPanel = ({ workspaceId, projectId, activeId, open }: LeftPanelProps) => {
  const { data: requirements, loading } = useRequirements(projectId)
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto bg-gray-50 p-3">
      <ProjectSwitcher workspaceId={workspaceId} activeProjectId={projectId} />
      {projectId === null ? (
        <p className="px-2 text-sm text-gray-400">Select a project.</p>
      ) : (
        <section className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">
            Requirements
          </h2>
          {loading && <p className="px-2 text-sm text-gray-400">loading…</p>}
          {!loading && requirements?.length === 0 && (
            <p className="px-2 text-sm text-gray-400">No requirements yet.</p>
          )}
          {requirements?.map(req => (
            <RequirementTree
              key={req.id}
              requirement={req}
              projectId={projectId}
              activeId={activeId}
              open={open}
            />
          ))}
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">
          Workers
        </h2>
        <p className="px-2 text-sm text-gray-400">Sessions and workers: M2.</p>
      </section>
    </div>
  )
}
