import type { Code, Id, Task, TaskStatus } from '@baton/shared'
import { fetchItemByCode } from './items.ts'
import { request } from './request.ts'

export type TaskInput = {
  requirementId: Id
  title: string
  spec?: string
  dependsOn?: Id[]
}

export type TaskClient = {
  create(input: TaskInput): Promise<Task>
  listByRequirement(requirementId: Id): Promise<Task[]>
  get(id: Id): Promise<Task>
  getByCode(projectId: Id, code: Code): Promise<Task>
  setStatus(id: Id, status: TaskStatus): Promise<Task>
  remove(id: Id): Promise<void>
}

export const taskClient = (baseUrl: string): TaskClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    create: input => request(u('/tasks'), { method: 'POST', body: input }),
    listByRequirement: requirementId =>
      request(u(`/requirements/${requirementId}/tasks`), { method: 'GET' }),
    get: id => request(u(`/tasks/${id}`), { method: 'GET' }),
    getByCode: (projectId, code) => fetchItemByCode<Task>(baseUrl, projectId, code, 'task'),
    setStatus: (id, status) => request(u(`/tasks/${id}`), { method: 'PATCH', body: { status } }),
    remove: id => request(u(`/tasks/${id}`), { method: 'DELETE' }),
  }
}
