import type { PrismaClient } from '@prisma/client'
import { toArtifact } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaArtifacts = (prisma: PrismaClient): Store['artifacts'] => ({
  create: async input =>
    toArtifact(
      await prisma.artifact.create({
        data: input,
      }),
    ),
  get: async id => {
    const artifact = await prisma.artifact.findUnique({ where: { id } })
    return artifact ? toArtifact(artifact) : null
  },
  getByKey: async key => {
    const artifact = await prisma.artifact.findUnique({ where: { key } })
    return artifact ? toArtifact(artifact) : null
  },
  listByProject: async projectId =>
    (
      await prisma.artifact.findMany({
        where: { projectId },
        orderBy: { id: 'desc' },
      })
    ).map(toArtifact),
  delete: async id => {
    await prisma.artifact.delete({ where: { id } })
  },
})
