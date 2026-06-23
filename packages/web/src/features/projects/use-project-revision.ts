import type { Id } from '@baton/shared'
import { useEffect, useState } from 'react'
import { subscribeProject } from './project-stream'

type Resource = 'sessions' | 'workers' | 'tasks' | 'loops'

// A revision counter that increments whenever the given project resource
// changes (pushed via the project stream). Use it as a refetch dependency:
// pass it into a polling hook's effect deps so a server-side change triggers an
// immediate refetch, with the slow poll as a backstop if the stream drops.
export const useProjectRevision = (projectId: Id | null, resource: Resource): number => {
  const [rev, setRev] = useState(0)
  useEffect(() => {
    if (projectId === null) return
    return subscribeProject(projectId, resource, () => setRev(r => r + 1))
  }, [projectId, resource])
  return rev
}
