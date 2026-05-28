import type {
  Assignment,
  AssignmentEvent,
  AssignmentStatus,
  Id,
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionMode,
  SessionStatus,
  Task,
  TaskStatus,
  Workspace,
} from '@baton/shared'
import type {
  Assignment as DbAssignment,
  AssignmentEvent as DbAssignmentEvent,
  Project as DbProject,
  Requirement as DbRequirement,
  Session as DbSession,
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
  code: r.code,
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
  projectId: r.projectId,
  code: r.code,
  title: r.title,
  spec: r.spec ?? undefined,
  requires: parseJson<string[]>(r.requires),
  dependsOn: parseJson<Id[]>(r.dependsOn),
  status: r.status as TaskStatus,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})

// apiToken intentionally NOT in the domain shape — caller selects it separately when issuing.
export const toSession = (r: DbSession): Session => ({
  id: r.id,
  projectId: r.projectId,
  code: r.code,
  mode: r.mode as SessionMode,
  name: r.name,
  capabilities: parseJson<string[]>(r.capabilities),
  status: r.status as SessionStatus,
  startedAt: r.startedAt.getTime(),
  heartbeatAt: r.heartbeatAt.getTime(),
  closedAt: r.closedAt?.getTime(),
})

export const toAssignment = (r: DbAssignment): Assignment => ({
  id: r.id,
  projectId: r.projectId,
  code: r.code,
  sessionId: r.sessionId,
  taskId: r.taskId,
  status: r.status as AssignmentStatus,
  result: r.result ?? undefined,
  startedAt: r.startedAt.getTime(),
  endedAt: r.endedAt?.getTime(),
})

export const toAssignmentEvent = (r: DbAssignmentEvent): AssignmentEvent => ({
  id: r.id,
  assignmentId: r.assignmentId,
  sequence: r.sequence,
  payload: JSON.parse(r.payload),
  createdAt: r.createdAt.getTime(),
})
