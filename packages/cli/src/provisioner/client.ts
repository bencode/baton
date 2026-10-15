import type {
  CreationWorkerResult,
  WorkerCreation,
  WorkerCreationReport,
  WorkerView,
} from '@baton/shared'
import { HttpError } from '../client/request.ts'
import type { ProvisionerConfig } from './config.ts'

export type ProvisionerClient = {
  get(id: number, signal?: AbortSignal): Promise<WorkerCreation>
  report(id: number, report: WorkerCreationReport, signal?: AbortSignal): Promise<WorkerCreation>
  register(id: number, hostname: string, signal?: AbortSignal): Promise<CreationWorkerResult>
  worker(id: number, token: string, signal?: AbortSignal): Promise<WorkerView>
}

export const createProvisionerClient = (config: ProvisionerConfig): ProvisionerClient => {
  const request = async <T>(
    path: string,
    token: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> => {
    const timeout = AbortSignal.timeout(10_000)
    const response = await fetch(`${config.server}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new HttpError(response.status, `provisioner request ${path}: HTTP ${response.status}`)
    }
    return (await response.json()) as T
  }
  return {
    get: (id, signal) =>
      request(`/provisioner/worker-creations/${id}`, config.token, undefined, signal),
    report: (id, report, signal) =>
      request(`/provisioner/worker-creations/${id}/progress`, config.token, report, signal),
    register: (id, hostname, signal) =>
      request(`/provisioner/worker-creations/${id}/worker`, config.token, { hostname }, signal),
    worker: (id, token, signal) => request(`/workers/${id}`, token, undefined, signal),
  }
}
