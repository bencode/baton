import type {
  Id,
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionEvent,
  SessionEventType,
  SessionMode,
  SessionState,
  Task,
  TaskStatus,
  Workspace,
} from '@baton/shared'
import type {
  Project as DbProject,
  Requirement as DbRequirement,
  Session as DbSession,
  SessionEvent as DbSessionEvent,
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
  dependsOn: parseJson<Id[]>(r.dependsOn),
  status: r.status as TaskStatus,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})

// apiToken intentionally NOT in the domain shape — register selects it
// separately when issuing the token; subsequent reads never re-expose it.
export const toSession = (r: DbSession): Session => ({
  id: r.id,
  projectId: r.projectId,
  code: r.code,
  mode: r.mode as SessionMode,
  name: r.name,
  state: r.state as SessionState,
  claudeSessionId: r.claudeSessionId ?? undefined,
  worktreePath: r.worktreePath ?? undefined,
  startedAt: r.startedAt.getTime(),
  heartbeatAt: r.heartbeatAt.getTime(),
  closedAt: r.closedAt?.getTime(),
})

export const toSessionEvent = (r: DbSessionEvent): SessionEvent => ({
  id: r.id,
  sessionId: r.sessionId,
  sequence: r.sequence,
  type: r.type as SessionEventType,
  payload: JSON.parse(r.payload),
  processedAt: r.processedAt?.getTime(),
  createdAt: r.createdAt.getTime(),
})
