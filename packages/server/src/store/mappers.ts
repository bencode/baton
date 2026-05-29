import type {
  AgentKind,
  Id,
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionEvent,
  SessionEventType,
  SessionMode,
  Task,
  TaskStatus,
  Worker,
  Workspace,
} from '@baton/shared'
import type {
  Project as DbProject,
  Requirement as DbRequirement,
  Session as DbSession,
  SessionEvent as DbSessionEvent,
  Task as DbTask,
  Worker as DbWorker,
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
  workerId: r.workerId,
  mode: r.mode as SessionMode,
  name: r.name,
  agentKind: r.agentKind as AgentKind,
  agentSessionId: r.agentSessionId,
  worktreePath: r.worktreePath,
  startedAt: r.startedAt.getTime(),
  closedAt: r.closedAt?.getTime(),
  updatedAt: r.updatedAt.getTime(),
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

export const toWorker = (r: DbWorker): Worker => ({
  id: r.id,
  projectId: r.projectId,
  machineId: r.machineId,
  name: r.name,
  hostname: r.hostname,
  startedAt: r.startedAt.getTime(),
  closedAt: r.closedAt?.getTime(),
})
