import type { Id, Loop } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { useProjectRevision } from '../projects/use-project-revision'

// A session's loops. Re-keyed by the project stream's 'loops' signal so a
// create / toggle / delete (here or from another client) refetches.
export const useLoops = (sessionId: Id | null, projectId: Id | null) => {
  const api = useApi()
  const rev = useProjectRevision(projectId, 'loops')
  return useAsync<Loop[]>(
    () => (sessionId !== null ? api.loops.listBySession(sessionId) : Promise.resolve([])),
    `${sessionId}:${rev}`,
  )
}
