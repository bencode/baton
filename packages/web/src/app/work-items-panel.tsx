import type { Id } from '@baton/shared'
import { useRequirements } from '../features/requirements/use-requirements'
import { usePersistedSet } from '../hooks/use-persisted-set'
import { RequirementTree } from './requirement-tree'

export const WorkItemsPanel = ({
  projectId,
  activeId,
  open,
}: {
  projectId: Id
  activeId: string
  open(path: string, title: string): void
}) => {
  const { data: requirements, loading, error } = useRequirements(projectId)
  const collapsed = usePersistedSet('baton.req.collapsed')
  return (
    <>
      {loading && !requirements && (
        <p role="status" className="px-2 text-sm text-ui-muted">
          加载需求…
        </p>
      )}
      {error && (
        <p role="alert" className="px-2 text-sm text-ui-danger">
          无法加载需求。
        </p>
      )}
      {!loading && !error && requirements?.length === 0 && (
        <p className="px-2 text-sm text-ui-muted">暂无工作项。</p>
      )}
      {requirements?.map(requirement => (
        <RequirementTree
          key={requirement.id}
          requirement={requirement}
          projectId={projectId}
          activeId={activeId}
          expanded={!collapsed.has(String(requirement.id))}
          onToggle={() => collapsed.toggle(String(requirement.id))}
          open={open}
        />
      ))}
    </>
  )
}
