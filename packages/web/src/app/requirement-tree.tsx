import { arrangeTasks, type Id, type Requirement } from '@baton/shared'
import { useMemo } from 'react'
import { RequirementNode } from '../features/requirements/requirement-node'
import { TaskNode } from '../features/tasks/task-node'
import { useTasks } from '../features/tasks/use-tasks'
import { itemPath } from './route'

type RequirementTreeProps = {
  requirement: Requirement
  projectId: Id
  activeId: string
  expanded: boolean
  onToggle: () => void
  open: (id: string, title: string) => void
}

// Cross-domain composition (app layer): a requirement header + its tasks laid
// out by dependency depth. Tasks indent one level under the requirement and
// collapse via a grid-template-rows transition (no JS height measurement).
// "Ready" is computed inside task-detail, not at the row level.
export const RequirementTree = ({
  requirement,
  projectId,
  activeId,
  expanded,
  onToggle,
  open,
}: RequirementTreeProps) => {
  const { data: tasks } = useTasks(requirement.id)
  const arranged = useMemo(() => arrangeTasks(tasks ?? []), [tasks])
  const reqPath = itemPath(projectId, requirement.code)
  return (
    <div className="flex flex-col">
      <RequirementNode
        requirement={requirement}
        active={activeId === reqPath}
        expanded={expanded}
        onOpen={() => open(reqPath, requirement.title)}
        onToggle={onToggle}
      />
      <div
        id={`${requirement.id}-tasks`}
        aria-hidden={!expanded}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {arranged.map(({ task, depth }) => {
            const path = itemPath(projectId, task.code)
            return (
              <TaskNode
                key={task.id}
                task={task}
                depth={depth + 1}
                active={activeId === path}
                onOpen={() => open(path, task.title)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
