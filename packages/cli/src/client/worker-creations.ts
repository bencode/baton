import type { CreateWorkerInput, Id, WorkerCreation, WorkerTemplate } from '@baton/shared'
import { request } from './request.ts'

export type WorkerCreationsClient = {
  templates(projectId: Id): Promise<WorkerTemplate[]>
  create(projectId: Id, input: CreateWorkerInput): Promise<WorkerCreation>
  listByProject(projectId: Id): Promise<WorkerCreation[]>
  get(id: Id): Promise<WorkerCreation>
}
export const workerCreationsClient = (baseUrl: string): WorkerCreationsClient => ({
  templates: projectId =>
    request(`${baseUrl}/projects/${projectId}/worker-templates`, { method: 'GET' }),
  create: (projectId, input) =>
    request(`${baseUrl}/projects/${projectId}/worker-creations`, { method: 'POST', body: input }),
  listByProject: projectId =>
    request(`${baseUrl}/projects/${projectId}/worker-creations`, { method: 'GET' }),
  get: id => request(`${baseUrl}/worker-creations/${id}`, { method: 'GET' }),
})
