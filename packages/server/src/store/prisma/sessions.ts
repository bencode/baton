import type { PrismaClient } from '@prisma/client'
import { toSession, toSessionEvent } from '../mappers.ts'
import type { Store } from '../types.ts'
import { issueToken } from './codec.ts'

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
        // Unguessable key for the standalone share page (/s/:shareToken).
        shareToken: issueToken(),
        agentKind: input.agentKind,
      },
    })
    return toSession(s)
  },
  getByShareToken: async token => {
    const r = await prisma.session.findFirst({ where: { shareToken: token } })
    return r ? toSession(r) : null
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
  touch: async id =>
    toSession(await prisma.session.update({ where: { id }, data: { lastActiveAt: new Date() } })),
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
  // Append one transcript event with the next per-session sequence. The
  // read-then-insert runs in a tx so concurrent appends can't collide on the
  // (sessionId, sequence) unique key.
  appendEvent: async (sessionId, type, payload) =>
    prisma.$transaction(async tx => {
      const top = await tx.sessionEvent.findFirst({
        where: { sessionId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      })
      const ev = await tx.sessionEvent.create({
        data: {
          sessionId,
          sequence: (top?.sequence ?? -1) + 1,
          type,
          payload: JSON.stringify(payload),
        },
      })
      return toSessionEvent(ev)
    }),
  listEvents: async sessionId =>
    (
      await prisma.sessionEvent.findMany({ where: { sessionId }, orderBy: { sequence: 'asc' } })
    ).map(toSessionEvent),
  // Take the newest `limit` (optionally below `before`) by reading desc, then
  // reverse to the ascending order the rest of the pipeline expects.
  listEventWindow: async (sessionId, { before, limit }) =>
    (
      await prisma.sessionEvent.findMany({
        where: { sessionId, ...(before === undefined ? {} : { sequence: { lt: before } }) },
        orderBy: { sequence: 'desc' },
        take: limit,
      })
    )
      .map(toSessionEvent)
      .reverse(),
})
