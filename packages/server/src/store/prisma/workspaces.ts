import type { PrismaClient } from '@prisma/client'
import { toWorkspace } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaWorkspaces = (prisma: PrismaClient): Store['workspaces'] => ({
  create: async input => toWorkspace(await prisma.workspace.create({ data: { name: input.name } })),
  get: async id => {
    const r = await prisma.workspace.findUnique({ where: { id } })
    return r ? toWorkspace(r) : null
  },
  list: async () => (await prisma.workspace.findMany()).map(toWorkspace),
  delete: async id => {
    await prisma.workspace.delete({ where: { id } })
  },
})
