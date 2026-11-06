import type { AdminHost, HostCredential, Id } from '@baton/shared'
import { request } from './request.ts'

export type HostsClient = {
  create(name: string): Promise<HostCredential>
  list(): Promise<AdminHost[]>
  rotate(id: Id): Promise<HostCredential>
  assign(id: Id, workspaceId: Id): Promise<void>
  unassign(id: Id, workspaceId: Id): Promise<void>
}

export const hostsClient = (baseUrl: string): HostsClient => ({
  create: name => request(`${baseUrl}/hosts`, { method: 'POST', body: { name } }),
  list: () => request(`${baseUrl}/hosts`, { method: 'GET' }),
  rotate: id => request(`${baseUrl}/hosts/${id}/token`, { method: 'POST', body: {} }),
  assign: (id, workspaceId) =>
    request(`${baseUrl}/hosts/${id}/workspaces/${workspaceId}`, { method: 'PUT' }),
  unassign: (id, workspaceId) =>
    request(`${baseUrl}/hosts/${id}/workspaces/${workspaceId}`, { method: 'DELETE' }),
})
