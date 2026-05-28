import type { Id, Project } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

export const useProjects = (workspaceId: Id | null) => {
  const api = useApi()
  return useAsync<Project[]>(
    () => (workspaceId !== null ? api.projects.listByWorkspace(workspaceId) : Promise.resolve([])),
    workspaceId,
  )
}

export const useProject = (projectId: Id | null) => {
  const api = useApi()
  return useAsync<Project | null>(
    () => (projectId !== null ? api.projects.get(projectId) : Promise.resolve(null)),
    projectId,
  )
}
