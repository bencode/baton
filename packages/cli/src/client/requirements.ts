import type { Code, ExternalRef, Id, Requirement, RequirementStatus, ResourceRef } from '@baton/shared'
import { fetchItemByCode } from './items.ts'
import { request } from './request.ts'

export type RequirementInput = {
  projectId: Id
  title: string
  description?: string
  body?: string
  resources?: ResourceRef[]
  external?: ExternalRef
}

export type RequirementUpdate = Partial<{
  title: string
  description: string
  body: string
  external: ExternalRef | null // null clears the association (unlink)
}>

export type RequirementClient = {
  create(input: RequirementInput): Promise<Requirement>
  listByProject(projectId: Id): Promise<Requirement[]>
  get(id: Id): Promise<Requirement>
  getByCode(projectId: Id, code: Code): Promise<Requirement>
  update(id: Id, patch: RequirementUpdate): Promise<Requirement>
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
    update: (id, patch) => request(u(`/requirements/${id}`), { method: 'PATCH', body: patch }),
    setStatus: (id, status) =>
      request(u(`/requirements/${id}`), { method: 'PATCH', body: { status } }),
    remove: id => request(u(`/requirements/${id}`), { method: 'DELETE' }),
  }
}
