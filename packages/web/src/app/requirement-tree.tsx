import { arrangeTasks, isReady, type Requirement } from '@baton/shared'
import { useMemo } from 'react'
import { RequirementNode } from '../features/requirements/requirement-node.tsx'
import { TaskNode } from '../features/tasks/task-node.tsx'
import { useTasks } from '../features/tasks/use-tasks.ts'
import { requirementPath, taskPath } from './route.ts'

type RequirementTreeProps = {
  requirement: Requirement
  projectId: string
  activeId: string
  open: (id: string, title: string) => void
}

// Cross-domain composition (app layer): a requirement header + its tasks laid
// out by dependency depth. Tasks indent one level under the requirement.
export const RequirementTree = ({
  requirement,
  projectId,
  activeId,
  open,
}: RequirementTreeProps) => {
  const { data: tasks } = useTasks(requirement.id)
  const byId = useMemo(() => new Map((tasks ?? []).map(t => [t.id, t])), [tasks])
  const arranged = useMemo(() => arrangeTasks(tasks ?? []), [tasks])
  const reqPath = requirementPath(projectId, requirement.id)
  return (
    <div className="flex flex-col">
      <RequirementNode
        requirement={requirement}
        active={activeId === reqPath}
        onOpen={() => open(reqPath, requirement.title)}
      />
      {arranged.map(({ task, depth }) => {
        const path = taskPath(projectId, task.id)
        return (
          <TaskNode
            key={task.id}
            task={task}
            depth={depth + 1}
            ready={isReady(task, byId)}
            active={activeId === path}
            onOpen={() => open(path, task.title)}
          />
        )
      })}
    </div>
  )
}
