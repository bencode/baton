import type { PrismaClient } from '@prisma/client'
import { toProject } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaProjects = (prisma: PrismaClient): Store['projects'] => ({
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
    (await prisma.project.findMany({ where: { workspaceId }, orderBy: { id: 'asc' } })).map(
      toProject,
    ),
  listAll: async () => (await prisma.project.findMany({ orderBy: { id: 'asc' } })).map(toProject),
  update: async (id, patch) =>
    toProject(
      await prisma.project.update({
        where: { id },
        data: { name: patch.name, description: patch.description },
      }),
    ),
  delete: async id => {
    await prisma.project.delete({ where: { id } })
  },
})
