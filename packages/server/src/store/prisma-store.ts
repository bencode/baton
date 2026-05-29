import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import {
  toProject,
  toRequirement,
  toSession,
  toSessionEvent,
  toTask,
  toWorker,
  toWorkspace,
} from './mappers.ts'
import type { Store } from './types.ts'

const PREFIX = { requirement: 'R', task: 'T' } as const
type Kind = keyof typeof PREFIX

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

// Atomic per-(project, kind) counter increment via upsert. First-ever use of a
// kind creates the row at next=2 (consumed 1); subsequent uses bump by 1.
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

// Per-session monotonic sequence: next int after the current max (or 0 when empty).
const nextSequence = async (tx: TxClient, sessionId: number): Promise<number> => {
  const top = await tx.sessionEvent.findFirst({
    where: { sessionId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  })
  return (top?.sequence ?? -1) + 1
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
    register: async input => {
      const apiToken = issueToken()
      const s = await prisma.session.create({
        data: {
          projectId: input.projectId,
          mode: input.mode,
          name: input.name,
          apiToken,
          claudeSessionId: input.claudeSessionId,
          worktreePath: input.worktreePath,
          machineId: input.machineId,
          hostname: input.hostname,
          workerName: input.workerName,
        },
      })
      return { ...toSession(s), apiToken }
    },
    get: async id => {
      const r = await prisma.session.findUnique({ where: { id } })
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
    close: async id => {
      await prisma.session.update({
        where: { id },
        data: { closedAt: new Date() },
      })
    },
    appendEvent: async (sessionId, type, payload) =>
      prisma.$transaction(async tx => {
        const sequence = await nextSequence(tx, sessionId)
        const ev = await tx.sessionEvent.create({
          data: { sessionId, sequence, type, payload: JSON.stringify(payload) },
        })
        return toSessionEvent(ev)
      }),
    listEvents: async sessionId =>
      (
        await prisma.sessionEvent.findMany({
          where: { sessionId },
          orderBy: { sequence: 'asc' },
        })
      ).map(toSessionEvent),
    findNextPendingMessage: async sessionId => {
      const r = await prisma.sessionEvent.findFirst({
        where: { sessionId, type: 'user_message', processedAt: null },
        orderBy: { sequence: 'asc' },
      })
      return r ? toSessionEvent(r) : null
    },
    markMessageProcessed: async eventId => {
      await prisma.sessionEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date() },
      })
    },
    pendingMessageCount: async sessionId =>
      prisma.sessionEvent.count({
        where: { sessionId, type: 'user_message', processedAt: null },
      }),
    // Busy ⇔ the latest turn_start has no following turn_complete / turn_error.
    isBusy: async sessionId => {
      const lastStart = await prisma.sessionEvent.findFirst({
        where: { sessionId, type: 'turn_start' },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      })
      if (!lastStart) return false
      const closer = await prisma.sessionEvent.findFirst({
        where: {
          sessionId,
          sequence: { gt: lastStart.sequence },
          type: { in: ['turn_complete', 'turn_error'] },
        },
        select: { id: true },
      })
      return closer === null
    },
  },
  workers: {
    // Identity-recovery algorithm:
    //   1) (projectId, machineId) alive → re-attach, update name if changed
    //   2a) no name match → create
    //   2b) name match with NULL machineId → legacy claim, fill machineId
    //   2c) name match with different machineId → name-collision
    register: async input => {
      return prisma.$transaction(async tx => {
        const byMachine = await tx.worker.findFirst({
          where: { projectId: input.projectId, machineId: input.machineId, closedAt: null },
        })
        if (byMachine) {
          const updated =
            byMachine.name !== input.name || byMachine.hostname !== input.hostname
              ? await tx.worker.update({
                  where: { id: byMachine.id },
                  data: { name: input.name, hostname: input.hostname },
                })
              : byMachine
          return { kind: 'reattached-machine', worker: toWorker(updated) }
        }
        const byName = await tx.worker.findFirst({
          where: { projectId: input.projectId, name: input.name, closedAt: null },
        })
        if (!byName) {
          const created = await tx.worker.create({
            data: {
              projectId: input.projectId,
              machineId: input.machineId,
              name: input.name,
              hostname: input.hostname,
            },
          })
          return { kind: 'created', worker: toWorker(created) }
        }
        if (byName.machineId === '' || byName.machineId === null) {
          const claimed = await tx.worker.update({
            where: { id: byName.id },
            data: { machineId: input.machineId, hostname: input.hostname },
          })
          return { kind: 'claimed-legacy', worker: toWorker(claimed) }
        }
        return { kind: 'name-collision', existing: toWorker(byName) }
      })
    },
    get: async id => {
      const r = await prisma.worker.findUnique({ where: { id } })
      return r ? toWorker(r) : null
    },
    findAlive: async (projectId, machineId) => {
      const r = await prisma.worker.findFirst({
        where: { projectId, machineId, closedAt: null },
      })
      return r ? toWorker(r) : null
    },
    listByProject: async projectId =>
      (await prisma.worker.findMany({ where: { projectId }, orderBy: { id: 'asc' } })).map(
        toWorker,
      ),
    close: async id => {
      await prisma.worker.update({ where: { id }, data: { closedAt: new Date() } })
    },
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
