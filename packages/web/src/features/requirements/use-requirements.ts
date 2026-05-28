import type { Requirement } from '@baton/shared'
import { useApi } from '../../app/api-context.ts'
import { useAsync } from '../../hooks/use-async.ts'

export const useRequirements = (projectId: string | null) => {
  const api = useApi()
  return useAsync<Requirement[]>(
    () => (projectId ? api.requirements.listByProject(projectId) : Promise.resolve([])),
    projectId,
  )
}

export const useRequirement = (requirementId: string | null) => {
  const api = useApi()
  return useAsync<Requirement | null>(
    () => (requirementId ? api.requirements.get(requirementId) : Promise.resolve(null)),
    requirementId,
  )
}
