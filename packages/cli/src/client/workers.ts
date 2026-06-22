import type { Id, WorkerView } from '@baton/shared'
import { request } from './request.ts'

export type WorkerRegisterInput = {
  projectId: Id
  machineId: string
  name: string
  hostname: string
}
export type WorkerRegisterOutcome = 'created' | 'reattached-machine' | 'claimed-legacy'
export type WorkerRegisterOutput = {
  worker: WorkerView
  apiToken: string
  outcome: WorkerRegisterOutcome
}

export type WorkersClient = {
  register(input: WorkerRegisterInput): Promise<WorkerRegisterOutput>
  listByProject(projectId: Id): Promise<WorkerView[]>
  get(id: Id): Promise<WorkerView>
  findByName(projectId: Id, name: string): Promise<WorkerView | null>
  heartbeat(machineId: string): Promise<{ ok: boolean }>
  destroy(id: Id): Promise<void>
}

export const workersClient = (baseUrl: string): WorkersClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    register: input => request(u('/workers'), { method: 'POST', body: input }),
    listByProject: projectId => request(u(`/projects/${projectId}/workers`), { method: 'GET' }),
    get: id => request(u(`/workers/${id}`), { method: 'GET' }),
    findByName: async (projectId, name) => {
      const all = await request<WorkerView[]>(u(`/projects/${projectId}/workers`), {
        method: 'GET',
      })
      const matches = all.filter(w => w.name === name)
      return matches.length === 0 ? null : (matches[matches.length - 1] ?? null)
    },
    heartbeat: machineId =>
      request(u('/workers/heartbeat'), { method: 'POST', body: { machineId } }),
    destroy: async id => {
      await request(u(`/workers/${id}`), { method: 'DELETE' })
    },
  }
}
