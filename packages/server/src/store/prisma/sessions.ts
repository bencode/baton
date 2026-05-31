import type { PrismaClient } from '@prisma/client'
import { toSession } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaSessions = (prisma: PrismaClient): Store['sessions'] => ({
  create: async input => {
    const s = await prisma.session.create({
      data: {
        projectId: input.projectId,
        workerId: input.workerId,
        mode: input.mode,
        name: input.name,
        agentKind: input.agentKind,
      },
    })
    return toSession(s)
  },
  materialize: async (id, input) => {
    const s = await prisma.session.update({
      where: { id },
      data: { agentSessionId: input.agentSessionId, worktreePath: input.worktreePath },
    })
    return toSession(s)
  },
  rename: async (id, name) => {
    const s = await prisma.session.update({ where: { id }, data: { name } })
    return toSession(s)
  },
  get: async id => {
    const r = await prisma.session.findUnique({ where: { id } })
    return r ? toSession(r) : null
  },
  listByProject: async projectId =>
    (await prisma.session.findMany({ where: { projectId }, orderBy: { id: 'asc' } })).map(
      toSession,
    ),
  destroy: async id => {
    await prisma.session.delete({ where: { id } })
  },
})
