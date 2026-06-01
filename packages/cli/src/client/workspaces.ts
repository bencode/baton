import type { Id, Workspace } from '@baton/shared'
import { request } from './request.ts'

export type WorkspaceInput = { name: string }
export type WorkspacePatch = Partial<WorkspaceInput>

export type WorkspaceClient = {
  create(input: WorkspaceInput): Promise<Workspace>
  list(): Promise<Workspace[]>
  get(id: Id): Promise<Workspace>
  update(id: Id, patch: WorkspacePatch): Promise<Workspace>
  remove(id: Id): Promise<void>
}

export const workspaceClient = (baseUrl: string): WorkspaceClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    create: input => request(u('/workspaces'), { method: 'POST', body: input }),
    list: () => request(u('/workspaces'), { method: 'GET' }),
    get: id => request(u(`/workspaces/${id}`), { method: 'GET' }),
    update: (id, patch) => request(u(`/workspaces/${id}`), { method: 'PATCH', body: patch }),
    remove: id => request(u(`/workspaces/${id}`), { method: 'DELETE' }),
  }
}
