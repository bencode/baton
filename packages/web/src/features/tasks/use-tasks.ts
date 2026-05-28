import type { Code, Id, Task } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

export const useTasks = (requirementId: Id | null) => {
  const api = useApi()
  return useAsync<Task[]>(
    () =>
      requirementId !== null ? api.tasks.listByRequirement(requirementId) : Promise.resolve([]),
    requirementId,
  )
}

export const useTask = (taskId: Id | null) => {
  const api = useApi()
  return useAsync<Task | null>(
    () => (taskId !== null ? api.tasks.get(taskId) : Promise.resolve(null)),
    taskId,
  )
}

// Look up a task by its project-scoped code (T-N). Mirror of [[useRequirementByCode]].
export const useTaskByCode = (projectId: Id | null, code: Code | null) => {
  const api = useApi()
  const key = projectId !== null && code ? `${projectId}/${code}` : null
  return useAsync<Task | null>(
    () =>
      projectId !== null && code ? api.tasks.getByCode(projectId, code) : Promise.resolve(null),
    key,
  )
}
