import type { PrismaClient } from '@prisma/client'
import { toSession } from '../mappers.ts'
import type { Store } from '../types.ts'
import { issueToken } from './codec.ts'

export const prismaSessions = (prisma: PrismaClient): Store['sessions'] => ({
  register: async input => {
    const apiToken = issueToken()
    const s = await prisma.session.create({
      data: {
        projectId: input.projectId,
        workerId: input.workerId,
        mode: input.mode,
        name: input.name,
        apiToken,
        agentKind: input.agentKind,
        agentSessionId: input.agentSessionId,
        worktreePath: input.worktreePath,
      },
    })
    return { ...toSession(s), apiToken }
  },
  get: async id => {
    const r = await prisma.session.findUnique({ where: { id } })
    return r ? toSession(r) : null
  },
  getByToken: async token => {
    const r = await prisma.session.findUnique({ where: { apiToken: token } })
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
