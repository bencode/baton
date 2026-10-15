import type { PrismaClient } from '@prisma/client'
import { toWorkerCreation } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaWorkerCreations = (prisma: PrismaClient): Store['workerCreations'] => ({
  create: async input => toWorkerCreation(await prisma.workerCreation.create({ data: input })),
  get: async id => {
    const row = await prisma.workerCreation.findUnique({ where: { id } })
    return row ? toWorkerCreation(row) : null
  },
  listByProject: async projectId =>
    (await prisma.workerCreation.findMany({ where: { projectId }, orderBy: { id: 'desc' } })).map(
      toWorkerCreation,
    ),
  worklist: async () =>
    (
      await prisma.workerCreation.findMany({
        where: { status: { in: ['pending', 'running'] } },
        orderBy: { id: 'asc' },
      })
    ).map(toWorkerCreation),
  update: async (id, patch) =>
    toWorkerCreation(
      await prisma.workerCreation.update({
        where: { id },
        data: {
          ...patch,
          finishedAt:
            patch.finishedAt === undefined
              ? undefined
              : patch.finishedAt === null
                ? null
                : new Date(patch.finishedAt),
        },
      }),
    ),
})
