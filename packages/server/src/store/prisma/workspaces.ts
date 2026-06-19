import type { PrismaClient } from '@prisma/client'
import { toWorkspace } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaWorkspaces = (prisma: PrismaClient): Store['workspaces'] => ({
  create: async input => toWorkspace(await prisma.workspace.create({ data: { name: input.name } })),
  get: async id => {
    const r = await prisma.workspace.findUnique({ where: { id } })
    return r ? toWorkspace(r) : null
  },
  list: async () => (await prisma.workspace.findMany({ orderBy: { id: 'asc' } })).map(toWorkspace),
  listForUser: async userId =>
    (
      await prisma.workspace.findMany({
        where: { members: { some: { userId } } },
        orderBy: { id: 'asc' },
      })
    ).map(toWorkspace),
  update: async (id, patch) =>
    toWorkspace(await prisma.workspace.update({ where: { id }, data: { name: patch.name } })),
  delete: async id => {
    await prisma.workspace.delete({ where: { id } })
  },
})
