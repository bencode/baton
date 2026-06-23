import type { Code, Id, Requirement, RequirementStatus, ResourceRef } from '@baton/shared'
import { fetchItemByCode } from './items'
import { request, type Url } from './request'

export type RequirementInput = {
  projectId: Id
  title: string
  description?: string
  body?: string
  resources?: ResourceRef[]
}

export type RequirementsApi = {
  create(input: RequirementInput): Promise<Requirement>
  listByProject(projectId: Id): Promise<Requirement[]>
  get(id: Id): Promise<Requirement>
  getByCode(projectId: Id, code: Code): Promise<Requirement>
  setStatus(id: Id, status: RequirementStatus): Promise<Requirement>
  remove(id: Id): Promise<void>
}

export const requirementsApi = (u: Url): RequirementsApi => ({
  create: input => request(u('/requirements'), { method: 'POST', body: input }),
  listByProject: projectId => request(u(`/projects/${projectId}/requirements`), { method: 'GET' }),
  get: id => request(u(`/requirements/${id}`), { method: 'GET' }),
  getByCode: async (projectId, code) =>
    (await fetchItemByCode(u, projectId, code, 'requirement')) as Requirement,
  setStatus: (id, status) =>
    request(u(`/requirements/${id}`), { method: 'PATCH', body: { status } }),
  remove: id => request(u(`/requirements/${id}`), { method: 'DELETE' }),
})
