import type { PrismaClient } from '@prisma/client'
import { toTask } from '../mappers.ts'
import type { Store } from '../types.ts'
import { nextCode } from './codec.ts'

export const prismaTasks = (prisma: PrismaClient): Store['tasks'] => ({
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
          body: input.body,
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
          body: patch.body,
          dependsOn: patch.dependsOn ? JSON.stringify(patch.dependsOn) : undefined,
          status: patch.status,
        },
      }),
    ),
  delete: async id => {
    await prisma.task.delete({ where: { id } })
  },
})
