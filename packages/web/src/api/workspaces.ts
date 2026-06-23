import type { Id, Workspace } from '@baton/shared'
import { request, type Url } from './request'

export type WorkspaceInput = { name: string }

export type WorkspacesApi = {
  create(input: WorkspaceInput): Promise<Workspace>
  list(): Promise<Workspace[]>
  get(id: Id): Promise<Workspace>
  update(id: Id, patch: { name?: string }): Promise<Workspace>
  remove(id: Id): Promise<void>
}

export const workspacesApi = (u: Url): WorkspacesApi => ({
  create: input => request(u('/workspaces'), { method: 'POST', body: input }),
  list: () => request(u('/workspaces'), { method: 'GET' }),
  get: id => request(u(`/workspaces/${id}`), { method: 'GET' }),
  update: (id, patch) => request(u(`/workspaces/${id}`), { method: 'PATCH', body: patch }),
  remove: id => request(u(`/workspaces/${id}`), { method: 'DELETE' }),
})
