import { ProjectSwitcher } from '../features/projects/project-switcher'
import { useRequirements } from '../features/requirements/use-requirements'
import { usePersistedSet } from '../hooks/use-persisted-set'
import { RequirementTree } from './requirement-tree'

type LeftPanelProps = {
  workspaceId: string | null
  projectId: string | null
  activeId: string
  open: (id: string, title: string) => void
}

export const LeftPanel = ({ workspaceId, projectId, activeId, open }: LeftPanelProps) => {
  const { data: requirements, loading } = useRequirements(projectId)
  const collapsed = usePersistedSet('baton.req.collapsed')
  return (
    <div className="flex h-full flex-col gap-5 overflow-auto bg-gray-50/60 p-3">
      <ProjectSwitcher workspaceId={workspaceId} activeProjectId={projectId} />
      {projectId === null ? (
        <p className="px-2 text-sm text-gray-400">Select a project.</p>
      ) : (
        <section className="flex flex-col gap-1">
          <h2 className="mb-1 px-1 text-xs font-semibold tracking-wider text-gray-500 uppercase">
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
              expanded={!collapsed.has(req.id)}
              onToggle={() => collapsed.toggle(req.id)}
              open={open}
            />
          ))}
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h2 className="mb-1 px-1 text-xs font-semibold tracking-wider text-gray-500 uppercase">
          Workers
        </h2>
        <p className="px-2 text-sm text-gray-400">Sessions and workers: M2.</p>
      </section>
    </div>
  )
}
