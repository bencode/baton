import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { toProject, toRequirement, toTask, toWorkspace } from './mappers.ts'
import type { Store } from './types.ts'

const newId = (): string => randomUUID()

// PrismaStore: first implementation of the Store port; maps rows ↔ domain types (JSON fields, DateTime↔number).
export const createPrismaStore = (prisma: PrismaClient): Store => ({
  workspaces: {
    create: async input =>
      toWorkspace(await prisma.workspace.create({ data: { id: newId(), name: input.name } })),
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
            id: newId(),
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
      toRequirement(
        await prisma.requirement.create({
          data: {
            id: newId(),
            projectId: input.projectId,
            title: input.title,
            description: input.description,
            resources: JSON.stringify(input.resources ?? []),
            tags: JSON.stringify(input.tags ?? []),
            status: input.status ?? 'active',
          },
        }),
      ),
    get: async id => {
      const r = await prisma.requirement.findUnique({ where: { id } })
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
      toTask(
        await prisma.task.create({
          data: {
            id: newId(),
            requirementId: input.requirementId,
            title: input.title,
            spec: input.spec,
            requires: JSON.stringify(input.requires ?? []),
            dependsOn: JSON.stringify(input.dependsOn ?? []),
            status: input.status ?? 'todo',
          },
        }),
      ),
    get: async id => {
      const r = await prisma.task.findUnique({ where: { id } })
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
