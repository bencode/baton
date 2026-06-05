import type { PrismaClient } from '@prisma/client'
import { toExternalColumns, toRequirement } from '../mappers.ts'
import type { Store } from '../types.ts'
import { nextCode } from './codec.ts'

export const prismaRequirements = (prisma: PrismaClient): Store['requirements'] => ({
  create: async input =>
    prisma.$transaction(async tx => {
      const code = await nextCode(tx, input.projectId, 'requirement')
      const r = await tx.requirement.create({
        data: {
          projectId: input.projectId,
          code,
          title: input.title,
          description: input.description,
          body: input.body,
          resources: JSON.stringify(input.resources ?? []),
          status: input.status ?? 'active',
          ...(input.external ? toExternalColumns(input.external) : {}),
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
          body: patch.body,
          resources: patch.resources ? JSON.stringify(patch.resources) : undefined,
          status: patch.status,
          ...(patch.external ? toExternalColumns(patch.external) : {}),
        },
      }),
    ),
  delete: async id => {
    await prisma.requirement.delete({ where: { id } })
  },
})
