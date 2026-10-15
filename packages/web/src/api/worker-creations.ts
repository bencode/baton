import type { CreateWorkerInput, Id, WorkerCreation, WorkerTemplate } from '@baton/shared'
import { request, type Url } from './request'

export type WorkerCreationsApi = {
  templates(projectId: Id): Promise<WorkerTemplate[]>
  create(projectId: Id, input: CreateWorkerInput): Promise<WorkerCreation>
  listByProject(projectId: Id): Promise<WorkerCreation[]>
}

export const workerCreationsApi = (url: Url): WorkerCreationsApi => ({
  templates: projectId =>
    request(url(`/projects/${projectId}/worker-templates`), {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    }),
  create: (projectId, body) =>
    request(url(`/projects/${projectId}/worker-creations`), {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    }),
  listByProject: projectId =>
    request(url(`/projects/${projectId}/worker-creations`), {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    }),
})
