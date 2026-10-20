import type { Code, Id, Requirement } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

// Look up a requirement by its project-scoped code (R-N). UI route uses code,
// so detail panels resolve through this hook rather than the int id.
export const useRequirementByCode = (projectId: Id | null, code: Code | null) => {
  const api = useApi()
  const key = projectId !== null && code ? `${projectId}/${code}` : null
  return useAsync<Requirement | null>(
    () =>
      projectId !== null && code
        ? api.requirements.getByCode(projectId, code)
        : Promise.resolve(null),
    key,
  )
}
