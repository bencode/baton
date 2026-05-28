import type { Project } from '@baton/shared'
import { useApi } from '../../app/api-context.ts'
import { useAsync } from '../../hooks/use-async.ts'

export const useProjects = (workspaceId: string | null) => {
  const api = useApi()
  return useAsync<Project[]>(
    () => (workspaceId ? api.projects.listByWorkspace(workspaceId) : Promise.resolve([])),
    workspaceId,
  )
}

export const useProject = (projectId: string | null) => {
  const api = useApi()
  return useAsync<Project | null>(
    () => (projectId ? api.projects.get(projectId) : Promise.resolve(null)),
    projectId,
  )
}
