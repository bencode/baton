import type {
  AgentKind,
  ExternalRef,
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
  TaskComment,
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
  TaskComment as DbTaskComment,
  User as DbUser,
  Worker as DbWorker,
  Workspace as DbWorkspace,
} from '@prisma/client'
import type { UserRecord } from './types.ts'

const parseJson = <T>(s: string): T => JSON.parse(s) as T

// The external* columns shared by Requirement and Task (light association).
type DbExternal = Pick<DbRequirement, 'externalSource' | 'externalNumber' | 'externalUrl'>

const toExternalRef = (r: DbExternal): ExternalRef | undefined =>
  r.externalSource
    ? {
        source: r.externalSource as ExternalRef['source'],
        number: r.externalNumber ?? undefined,
        url: r.externalUrl ?? undefined,
      }
    : undefined

// Domain ExternalRef → the external* column shape for Prisma create/update data.
export const toExternalColumns = (e: ExternalRef) => ({
  externalSource: e.source,
  externalNumber: e.number ?? null,
  externalUrl: e.url ?? null,
})

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
  body: r.body ?? undefined,
  resources: parseJson<ResourceRef[]>(r.resources),
  status: r.status as RequirementStatus,
  external: toExternalRef(r),
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})

export const toTask = (r: DbTask): Task => ({
  id: r.id,
  requirementId: r.requirementId,
  projectId: r.projectId,
  code: r.code,
  title: r.title,
  body: r.body ?? undefined,
  dependsOn: parseJson<Id[]>(r.dependsOn),
  status: r.status as TaskStatus,
  external: toExternalRef(r),
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})

export const toTaskComment = (r: DbTaskComment): TaskComment => ({
  id: r.id,
  taskId: r.taskId,
  body: r.body,
  workerId: r.workerId ?? undefined,
  createdAt: r.createdAt.getTime(),
})

// agentSessionId/worktreePath are null until the owning Worker materializes
// the session. apiToken lives only on Worker now (not Session).
export const toSession = (r: DbSession): Session => ({
  id: r.id,
  projectId: r.projectId,
  workerId: r.workerId,
  mode: r.mode as SessionMode,
  name: r.name,
  agentKind: r.agentKind as AgentKind,
  agentSessionId: r.agentSessionId,
  worktreePath: r.worktreePath,
  shareToken: r.shareToken,
  createdAt: r.createdAt.getTime(),
  updatedAt: r.updatedAt.getTime(),
})

export const toSessionEvent = (r: DbSessionEvent): SessionEvent => ({
  id: r.id,
  sessionId: r.sessionId,
  sequence: r.sequence,
  type: r.type as SessionEventType,
  payload: parseJson<unknown>(r.payload),
  createdAt: r.createdAt.getTime(),
})

export const toUserRecord = (r: DbUser): UserRecord => ({
  id: r.id,
  username: r.username,
  passwordHash: r.passwordHash,
  apiToken: r.apiToken,
  createdAt: r.createdAt.getTime(),
})

export const toWorker = (r: DbWorker): Worker => ({
  id: r.id,
  projectId: r.projectId,
  machineId: r.machineId,
  name: r.name,
  hostname: r.hostname,
  createdAt: r.createdAt.getTime(),
})
