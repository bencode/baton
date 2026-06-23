import type { Id, Project } from '@baton/shared'
import { request, type Url } from './request'

export type ProjectInput = { workspaceId: Id; name: string; description?: string }

export type ProjectsApi = {
  create(input: ProjectInput): Promise<Project>
  listByWorkspace(workspaceId: Id): Promise<Project[]>
  get(id: Id): Promise<Project>
  update(id: Id, patch: { name?: string; description?: string }): Promise<Project>
  remove(id: Id): Promise<void>
}

export const projectsApi = (u: Url): ProjectsApi => ({
  create: input => request(u('/projects'), { method: 'POST', body: input }),
  listByWorkspace: workspaceId =>
    request(u(`/workspaces/${workspaceId}/projects`), { method: 'GET' }),
  get: id => request(u(`/projects/${id}`), { method: 'GET' }),
  update: (id, patch) => request(u(`/projects/${id}`), { method: 'PATCH', body: patch }),
  remove: id => request(u(`/projects/${id}`), { method: 'DELETE' }),
})
