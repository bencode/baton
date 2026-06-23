import type { Code, Id, Task, TaskComment, TaskStatus } from '@baton/shared'
import { fetchItemByCode } from './items'
import { request, type Url } from './request'

export type TaskInput = {
  requirementId: Id
  title: string
  body?: string
  dependsOn?: Id[]
}

export type TasksApi = {
  create(input: TaskInput): Promise<Task>
  listByRequirement(requirementId: Id): Promise<Task[]>
  get(id: Id): Promise<Task>
  getByCode(projectId: Id, code: Code): Promise<Task>
  setStatus(id: Id, status: TaskStatus): Promise<Task>
  remove(id: Id): Promise<void>
  listComments(id: Id): Promise<TaskComment[]>
  addComment(id: Id, body: string, workerId?: Id): Promise<TaskComment>
}

export const tasksApi = (u: Url): TasksApi => ({
  create: input => request(u('/tasks'), { method: 'POST', body: input }),
  listByRequirement: requirementId =>
    request(u(`/requirements/${requirementId}/tasks`), { method: 'GET' }),
  get: id => request(u(`/tasks/${id}`), { method: 'GET' }),
  getByCode: async (projectId, code) => (await fetchItemByCode(u, projectId, code, 'task')) as Task,
  setStatus: (id, status) => request(u(`/tasks/${id}`), { method: 'PATCH', body: { status } }),
  remove: id => request(u(`/tasks/${id}`), { method: 'DELETE' }),
  listComments: id => request(u(`/tasks/${id}/comments`), { method: 'GET' }),
  addComment: (id, body, workerId) =>
    request(u(`/tasks/${id}/comments`), { method: 'POST', body: { body, workerId } }),
})
