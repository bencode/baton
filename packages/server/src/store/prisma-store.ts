import { randomBytes } from 'node:crypto'
import type { Id } from '@baton/shared'
import type { PrismaClient } from '@prisma/client'
import {
  toAssignment,
  toAssignmentEvent,
  toProject,
  toRequirement,
  toSession,
  toTask,
  toWorkspace,
} from './mappers.ts'
import type { Store } from './types.ts'

const PREFIX = { requirement: 'R', task: 'T', session: 'S', assignment: 'A' } as const
type Kind = keyof typeof PREFIX

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

// Atomic per-(project, kind) counter increment via upsert. First-ever use of a
// kind creates the row at next=2 (consumed 1); subsequent uses bump by 1. Lets
// us add new kinds (session, assignment, …) without seeding upfront.
const nextCode = async (tx: TxClient, projectId: number, kind: Kind): Promise<string> => {
  const c = await tx.codeCounter.upsert({
    where: { projectId_kind: { projectId, kind } },
    update: { next: { increment: 1 } },
    create: { projectId, kind, next: 2 },
    select: { next: true },
  })
  return `${PREFIX[kind]}-${c.next - 1}`
}

const issueToken = (): string => randomBytes(32).toString('base64url')

const isSubset = (needed: readonly string[], provided: readonly string[]): boolean => {
  const set = new Set(provided)
  return needed.every(n => set.has(n))
}

// PrismaStore: first implementation of the Store port. Maps rows ↔ domain types
// (JSON fields, DateTime↔number, int PKs).
export const createPrismaStore = (prisma: PrismaClient): Store => ({
  workspaces: {
    create: async input =>
      toWorkspace(await prisma.workspace.create({ data: { name: input.name } })),
    get: async id => {
      const r = await prisma.workspace.findUnique({ where: { id } })
      return r ? toWorkspace(r) : null
    },
    list: async () => (await prisma.workspace.findMany()).map(toWorkspace),
    delete: async id => {
      await prisma.workspace.delete({ where: { id } })
    },
  },
  projects: {
    create: async input =>
      toProject(
        await prisma.project.create({
          data: {
            workspaceId: input.workspaceId,
            name: input.name,
            description: input.description,
          },
        }),
      ),
    get: async id => {
      const r = await prisma.project.findUnique({ where: { id } })
      return r ? toProject(r) : null
    },
    listByWorkspace: async workspaceId =>
      (await prisma.project.findMany({ where: { workspaceId } })).map(toProject),
    delete: async id => {
      await prisma.project.delete({ where: { id } })
    },
  },
  requirements: {
    create: async input =>
      prisma.$transaction(async tx => {
        const code = await nextCode(tx, input.projectId, 'requirement')
        const r = await tx.requirement.create({
          data: {
            projectId: input.projectId,
            code,
            title: input.title,
            description: input.description,
            resources: JSON.stringify(input.resources ?? []),
            tags: JSON.stringify(input.tags ?? []),
            status: input.status ?? 'active',
          },
        })
        return toRequirement(r)
      }),
    get: async id => {
      const r = await prisma.requirement.findUnique({ where: { id } })
      return r ? toRequirement(r) : null
    },
    getByCode: async (projectId, code) => {
      const r = await prisma.requirement.findUnique({
        where: { projectId_code: { projectId, code } },
      })
      return r ? toRequirement(r) : null
    },
    listByProject: async projectId =>
      (await prisma.requirement.findMany({ where: { projectId } })).map(toRequirement),
    update: async (id, patch) =>
      toRequirement(
        await prisma.requirement.update({
          where: { id },
          data: {
            title: patch.title,
            description: patch.description,
            resources: patch.resources ? JSON.stringify(patch.resources) : undefined,
            tags: patch.tags ? JSON.stringify(patch.tags) : undefined,
            status: patch.status,
          },
        }),
      ),
    delete: async id => {
      await prisma.requirement.delete({ where: { id } })
    },
  },
  tasks: {
    create: async input =>
      prisma.$transaction(async tx => {
        const parent = await tx.requirement.findUniqueOrThrow({
          where: { id: input.requirementId },
          select: { projectId: true },
        })
        const code = await nextCode(tx, parent.projectId, 'task')
        const t = await tx.task.create({
          data: {
            requirementId: input.requirementId,
            projectId: parent.projectId,
            code,
            title: input.title,
            spec: input.spec,
            requires: JSON.stringify(input.requires ?? []),
            dependsOn: JSON.stringify(input.dependsOn ?? []),
            status: input.status ?? 'todo',
          },
        })
        return toTask(t)
      }),
    get: async id => {
      const r = await prisma.task.findUnique({ where: { id } })
      return r ? toTask(r) : null
    },
    getByCode: async (projectId, code) => {
      const r = await prisma.task.findUnique({ where: { projectId_code: { projectId, code } } })
      return r ? toTask(r) : null
    },
    listByRequirement: async requirementId =>
      (await prisma.task.findMany({ where: { requirementId } })).map(toTask),
    update: async (id, patch) =>
      toTask(
        await prisma.task.update({
          where: { id },
          data: {
            title: patch.title,
            spec: patch.spec,
            requires: patch.requires ? JSON.stringify(patch.requires) : undefined,
            dependsOn: patch.dependsOn ? JSON.stringify(patch.dependsOn) : undefined,
            status: patch.status,
          },
        }),
      ),
    delete: async id => {
      await prisma.task.delete({ where: { id } })
    },
  },
  sessions: {
    register: async input =>
      prisma.$transaction(async tx => {
        const code = await nextCode(tx, input.projectId, 'session')
        const apiToken = issueToken()
        const s = await tx.session.create({
          data: {
            projectId: input.projectId,
            code,
            mode: input.mode,
            name: input.name,
            capabilities: JSON.stringify(input.capabilities ?? []),
            apiToken,
            status: 'active',
          },
        })
        return { ...toSession(s), apiToken }
      }),
    get: async id => {
      const r = await prisma.session.findUnique({ where: { id } })
      return r ? toSession(r) : null
    },
    getByCode: async (projectId, code) => {
      const r = await prisma.session.findUnique({ where: { projectId_code: { projectId, code } } })
      return r ? toSession(r) : null
    },
    getByToken: async token => {
      const r = await prisma.session.findUnique({ where: { apiToken: token } })
      return r ? toSession(r) : null
    },
    listByProject: async projectId =>
      (await prisma.session.findMany({ where: { projectId }, orderBy: { id: 'asc' } })).map(
        toSession,
      ),
    heartbeat: async (id, status) =>
      toSession(
        await prisma.session.update({
          where: { id },
          data: { heartbeatAt: new Date(), status: status ?? 'active' },
        }),
      ),
    close: async id => {
      await prisma.session.update({
        where: { id },
        data: { status: 'closed', closedAt: new Date() },
      })
    },
    claim: async sessionId =>
      prisma.$transaction(async tx => {
        const session = await tx.session.findUnique({ where: { id: sessionId } })
        if (!session || session.status === 'closed') return null
        const caps = JSON.parse(session.capabilities) as string[]
        const projectId = session.projectId

        // Tasks already executing (running assignment) are off-limits.
        const taken = await tx.assignment.findMany({
          where: { projectId, status: 'running' },
          select: { taskId: true },
        })
        const takenIds = new Set(taken.map(t => t.taskId))

        // Done set for dependency satisfaction.
        const done = await tx.task.findMany({
          where: { projectId, status: 'done' },
          select: { id: true },
        })
        const doneIds = new Set(done.map(t => t.id))

        const todos = await tx.task.findMany({
          where: { projectId, status: 'todo' },
          orderBy: { createdAt: 'asc' },
        })
        const eligible = todos.find(t => {
          if (takenIds.has(t.id)) return false
          const deps = JSON.parse(t.dependsOn) as Id[]
          if (!deps.every(d => doneIds.has(d))) return false
          const requires = JSON.parse(t.requires) as string[]
          return isSubset(requires, caps)
        })
        if (!eligible) return null

        const code = await nextCode(tx, projectId, 'assignment')
        const updatedTask = await tx.task.update({
          where: { id: eligible.id },
          data: { status: 'in_progress' },
        })
        const assignment = await tx.assignment.create({
          data: {
            projectId,
            code,
            sessionId,
            taskId: eligible.id,
            status: 'running',
          },
        })
        return { assignment: toAssignment(assignment), task: toTask(updatedTask) }
      }),
    sweepStale: async (now, idleThresholdMs) => {
      const cutoff = new Date(now - idleThresholdMs)
      // Find active sessions whose heartbeat is older than cutoff.
      const stale = await prisma.session.findMany({
        where: { status: 'active', heartbeatAt: { lt: cutoff } },
        select: { id: true },
      })
      if (stale.length === 0) return 0
      let released = 0
      for (const { id } of stale) {
        await prisma.$transaction(async tx => {
          const running = await tx.assignment.findMany({
            where: { sessionId: id, status: 'running' },
            select: { id: true, taskId: true },
          })
          for (const a of running) {
            await tx.assignment.update({
              where: { id: a.id },
              data: { status: 'abandoned', endedAt: new Date() },
            })
            await tx.task.update({ where: { id: a.taskId }, data: { status: 'todo' } })
            released += 1
          }
          await tx.session.update({ where: { id }, data: { status: 'idle' } })
        })
      }
      return released
    },
  },
  assignments: {
    get: async id => {
      const r = await prisma.assignment.findUnique({ where: { id } })
      return r ? toAssignment(r) : null
    },
    getByCode: async (projectId, code) => {
      const r = await prisma.assignment.findUnique({
        where: { projectId_code: { projectId, code } },
      })
      return r ? toAssignment(r) : null
    },
    listByProject: async (projectId, filter) =>
      (
        await prisma.assignment.findMany({
          where: {
            projectId,
            ...(filter?.status ? { status: { in: filter.status } } : {}),
            ...(filter?.sessionId ? { sessionId: filter.sessionId } : {}),
          },
          orderBy: { id: 'desc' },
        })
      ).map(toAssignment),
    appendEvent: async (id, sequence, payload) =>
      toAssignmentEvent(
        await prisma.assignmentEvent.create({
          data: { assignmentId: id, sequence, payload: JSON.stringify(payload) },
        }),
      ),
    listEvents: async id =>
      (
        await prisma.assignmentEvent.findMany({
          where: { assignmentId: id },
          orderBy: { sequence: 'asc' },
        })
      ).map(toAssignmentEvent),
    complete: async (id, status, result) =>
      prisma.$transaction(async tx => {
        const a = await tx.assignment.findUniqueOrThrow({ where: { id } })
        const updated = await tx.assignment.update({
          where: { id },
          data: { status, result, endedAt: new Date() },
        })
        await tx.task.update({
          where: { id: a.taskId },
          data: { status: status === 'done' ? 'done' : 'failed' },
        })
        return toAssignment(updated)
      }),
    abandon: async (id, reason) =>
      prisma.$transaction(async tx => {
        const a = await tx.assignment.findUniqueOrThrow({ where: { id } })
        const updated = await tx.assignment.update({
          where: { id },
          data: { status: 'abandoned', result: reason, endedAt: new Date() },
        })
        // Release task back to todo so another session can claim it.
        await tx.task.update({ where: { id: a.taskId }, data: { status: 'todo' } })
        return toAssignment(updated)
      }),
  },
  getRequirementWithTasks: async id => {
    const r = await prisma.requirement.findUnique({ where: { id }, include: { tasks: true } })
    if (!r) return null
    return { requirement: toRequirement(r), tasks: r.tasks.map(toTask) }
  },
  close: async () => {
    await prisma.$disconnect()
  },
})
