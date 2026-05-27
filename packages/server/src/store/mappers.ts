import type {
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Task,
  TaskStatus,
  Workspace,
} from '@baton/shared'
import type {
  Project as DbProject,
  Requirement as DbRequirement,
  Task as DbTask,
  Workspace as DbWorkspace,
} from '@prisma/client'

const parseJson = <T>(s: string): T => JSON.parse(s) as T

export const toWorkspace = (r: DbWorkspace): Workspace => ({
  id: r.id,
  name: r.name,
  createdAt: r.createdAt.getTime(),
})

export const toProject = (r: DbProject): Project => ({
  id: r.id,
  workspaceId: r.workspaceId,
  name: r.name,
  description: r.description ?? undefined,
  createdAt: r.createdAt.getTime(),
})

export const toRequirement = (r: DbRequirement): Requirement => ({
  id: r.id,
  projectId: r.projectId,
  title: r.title,
  description: r.description ?? undefined,
  resources: parseJson<ResourceRef[]>(r.resources),
  tags: parseJson<string[]>(r.tags),
  status: r.status as RequirementStatus,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})

export const toTask = (r: DbTask): Task => ({
  id: r.id,
  requirementId: r.requirementId,
  title: r.title,
  spec: r.spec ?? undefined,
  requires: parseJson<string[]>(r.requires),
  dependsOn: parseJson<string[]>(r.dependsOn),
  status: r.status as TaskStatus,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})
