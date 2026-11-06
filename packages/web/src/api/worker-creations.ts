import type {
  CreateWorkerInput,
  HostOption,
  Id,
  WorkerCreation,
  WorkerTemplate,
} from '@baton/shared'
import { request, type Url } from './request'

export type WorkerCreationsApi = {
  hosts(projectId: Id): Promise<HostOption[]>
  templates(projectId: Id): Promise<WorkerTemplate[]>
  create(projectId: Id, input: CreateWorkerInput): Promise<WorkerCreation>
  listByProject(projectId: Id): Promise<WorkerCreation[]>
}

export const workerCreationsApi = (url: Url): WorkerCreationsApi => ({
  hosts: projectId =>
    request(url(`/projects/${projectId}/hosts`), {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    }),
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
