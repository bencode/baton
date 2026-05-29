import type { Code, Id, Requirement, RequirementStatus, ResourceRef } from '@baton/shared'
import { fetchItemByCode } from './items.ts'
import { request } from './request.ts'

export type RequirementInput = {
  projectId: Id
  title: string
  description?: string
  resources?: ResourceRef[]
  tags?: string[]
}

export type RequirementClient = {
  create(input: RequirementInput): Promise<Requirement>
  listByProject(projectId: Id): Promise<Requirement[]>
  get(id: Id): Promise<Requirement>
  getByCode(projectId: Id, code: Code): Promise<Requirement>
  setStatus(id: Id, status: RequirementStatus): Promise<Requirement>
  remove(id: Id): Promise<void>
}

export const requirementClient = (baseUrl: string): RequirementClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    create: input => request(u('/requirements'), { method: 'POST', body: input }),
    listByProject: projectId =>
      request(u(`/projects/${projectId}/requirements`), { method: 'GET' }),
    get: id => request(u(`/requirements/${id}`), { method: 'GET' }),
    getByCode: (projectId, code) =>
      fetchItemByCode<Requirement>(baseUrl, projectId, code, 'requirement'),
    setStatus: (id, status) =>
      request(u(`/requirements/${id}`), { method: 'PATCH', body: { status } }),
    remove: id => request(u(`/requirements/${id}`), { method: 'DELETE' }),
  }
}
