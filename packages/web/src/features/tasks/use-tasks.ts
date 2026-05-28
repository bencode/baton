import type { Task } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

export const useTasks = (requirementId: string | null) => {
  const api = useApi()
  return useAsync<Task[]>(
    () => (requirementId ? api.tasks.listByRequirement(requirementId) : Promise.resolve([])),
    requirementId,
  )
}

export const useTask = (taskId: string | null) => {
  const api = useApi()
  return useAsync<Task | null>(
    () => (taskId ? api.tasks.get(taskId) : Promise.resolve(null)),
    taskId,
  )
}
