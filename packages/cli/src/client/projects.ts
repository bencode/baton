import type { Id, Project } from '@baton/shared'
import { request } from './request.ts'

export type ProjectInput = { workspaceId: Id; name: string; description?: string }
export type ProjectPatch = Partial<Pick<ProjectInput, 'name' | 'description'>>

export type ProjectClient = {
  create(input: ProjectInput): Promise<Project>
  listByWorkspace(workspaceId: Id): Promise<Project[]>
  get(id: Id): Promise<Project>
  update(id: Id, patch: ProjectPatch): Promise<Project>
  remove(id: Id): Promise<void>
}

export const projectClient = (baseUrl: string): ProjectClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    create: input => request(u('/projects'), { method: 'POST', body: input }),
    listByWorkspace: workspaceId =>
      request(u(`/workspaces/${workspaceId}/projects`), { method: 'GET' }),
    get: id => request(u(`/projects/${id}`), { method: 'GET' }),
    update: (id, patch) => request(u(`/projects/${id}`), { method: 'PATCH', body: patch }),
    remove: id => request(u(`/projects/${id}`), { method: 'DELETE' }),
  }
}
