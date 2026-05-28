import type { PrismaClient } from '@prisma/client'
import { toProject, toRequirement, toTask, toWorkspace } from './mappers.ts'
import type { Store } from './types.ts'

const PREFIX = { requirement: 'R', task: 'T' } as const
type Kind = keyof typeof PREFIX

// Atomic per-(project, kind) counter increment via transaction. Returns the
// value just consumed (i.e. counter was N before, becomes N+1, we use N).
const nextCode = async (
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  projectId: number,
  kind: Kind,
): Promise<string> => {
  const c = await tx.codeCounter.update({
    where: { projectId_kind: { projectId, kind } },
    data: { next: { increment: 1 } },
    select: { next: true },
  })
  return `${PREFIX[kind]}-${c.next - 1}`
}

// PrismaStore: first implementation of the Store port. Maps rows ↔ domain types
// (JSON fields, DateTime↔number, int PKs). Project create initializes the two
// CodeCounter rows so subsequent code generation is UPDATE-only.
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
      prisma.$transaction(async tx => {
        const p = await tx.project.create({
          data: {
            workspaceId: input.workspaceId,
            name: input.name,
            description: input.description,
          },
        })
        await tx.codeCounter.createMany({
          data: [
            { projectId: p.id, kind: 'requirement', next: 1 },
            { projectId: p.id, kind: 'task', next: 1 },
          ],
        })
        return toProject(p)
      }),
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
        // Derive projectId from the parent requirement so Task.projectId stays in sync.
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
  getRequirementWithTasks: async id => {
    const r = await prisma.requirement.findUnique({ where: { id }, include: { tasks: true } })
    if (!r) return null
    return { requirement: toRequirement(r), tasks: r.tasks.map(toTask) }
  },
  close: async () => {
    await prisma.$disconnect()
  },
})
