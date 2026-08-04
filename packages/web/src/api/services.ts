import type { Id, ServicePresence } from '@baton/shared'
import { request, type Url } from './request'

export type ServicesApi = {
  listByProject(projectId: Id): Promise<ServicePresence[]>
  stop(workerId: Id, name: string): Promise<void>
}

export const servicesApi = (u: Url): ServicesApi => ({
  listByProject: projectId => request(u(`/projects/${projectId}/services`), { method: 'GET' }),
  stop: (workerId, name) =>
    request(u(`/workers/${workerId}/services/${encodeURIComponent(name)}`), {
      method: 'DELETE',
    }),
})
