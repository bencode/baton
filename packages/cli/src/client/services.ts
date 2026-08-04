import type {
  Id,
  ServiceActionResult,
  ServicePresence,
  ServiceReport,
  ServiceRunInput,
} from '@baton/shared'
import { request } from './request.ts'

export type ServicesClient = {
  listByProject(projectId: Id): Promise<ServicePresence[]>
  run(workerId: Id, input: ServiceRunInput): Promise<ServiceActionResult>
  stop(workerId: Id, name: string): Promise<void>
  report(input: ServiceReport): Promise<{ ok: true }>
}

export const servicesClient = (baseUrl: string): ServicesClient => {
  const u = (path: string): string => `${baseUrl}${path}`
  return {
    listByProject: projectId => request(u(`/projects/${projectId}/services`), { method: 'GET' }),
    run: (workerId, input) =>
      request(u(`/workers/${workerId}/services`), { method: 'POST', body: input }),
    stop: (workerId, name) =>
      request(u(`/workers/${workerId}/services/${encodeURIComponent(name)}`), {
        method: 'DELETE',
      }),
    report: input => request(u('/workers/me/services'), { method: 'PUT', body: input }),
  }
}
