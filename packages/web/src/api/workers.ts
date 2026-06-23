import type { Id, WorkerView } from '@baton/shared'
import { request, type Url } from './request'

export type WorkersApi = {
  listByProject(projectId: Id): Promise<WorkerView[]>
  get(id: Id): Promise<WorkerView>
  // Delete a worker (cascades to its sessions + their events).
  remove(id: Id): Promise<void>
}

export const workersApi = (u: Url): WorkersApi => ({
  listByProject: projectId => request(u(`/projects/${projectId}/workers`), { method: 'GET' }),
  get: id => request(u(`/workers/${id}`), { method: 'GET' }),
  remove: id => request(u(`/workers/${id}`), { method: 'DELETE' }),
})
