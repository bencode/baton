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
        // An explicitly-named session is locked from birth — never auto-retitled.
        // Nameless creates pass '' here (placeholder set after, unlocked).
        nameLocked: input.name.trim().length > 0,
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
  // Human rename: sets the name AND locks it (wins over any later auto-title).
  rename: async (id, name) => {
    const s = await prisma.session.update({ where: { id }, data: { name, nameLocked: true } })
    return toSession(s)
  },
  // Non-locking set, guarded: applies only while the name is unlocked. Used for
  // the `session-<id>` placeholder and the worker's auto-title. Returns the
  // updated session, or null when a human has already locked the name.
  autoTitle: async (id, name) => {
    const { count } = await prisma.session.updateMany({
      where: { id, nameLocked: false },
      data: { name },
    })
    if (count === 0) return null
    const s = await prisma.session.findUnique({ where: { id } })
    return s ? toSession(s) : null
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
