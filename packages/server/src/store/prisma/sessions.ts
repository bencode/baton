import type { PrismaClient } from '@prisma/client'
import { toSession, toSessionEvent } from '../mappers.ts'
import type { Store } from '../types.ts'
import { issueToken, nextSequence } from './codec.ts'

export const prismaSessions = (prisma: PrismaClient): Store['sessions'] => ({
  register: async input => {
    const apiToken = issueToken()
    const s = await prisma.session.create({
      data: {
        projectId: input.projectId,
        mode: input.mode,
        name: input.name,
        apiToken,
        claudeSessionId: input.claudeSessionId,
        worktreePath: input.worktreePath,
        machineId: input.machineId,
        hostname: input.hostname,
        workerName: input.workerName,
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
  close: async id => {
    await prisma.session.update({
      where: { id },
      data: { closedAt: new Date() },
    })
  },
  appendEvent: async (sessionId, type, payload) =>
    prisma.$transaction(async tx => {
      const sequence = await nextSequence(tx, sessionId)
      const ev = await tx.sessionEvent.create({
        data: { sessionId, sequence, type, payload: JSON.stringify(payload) },
      })
      return toSessionEvent(ev)
    }),
  listEvents: async sessionId =>
    (
      await prisma.sessionEvent.findMany({
        where: { sessionId },
        orderBy: { sequence: 'asc' },
      })
    ).map(toSessionEvent),
  findNextPendingMessage: async sessionId => {
    const r = await prisma.sessionEvent.findFirst({
      where: { sessionId, type: 'user_message', processedAt: null },
      orderBy: { sequence: 'asc' },
    })
    return r ? toSessionEvent(r) : null
  },
  markMessageProcessed: async eventId => {
    await prisma.sessionEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    })
  },
  pendingMessageCount: async sessionId =>
    prisma.sessionEvent.count({
      where: { sessionId, type: 'user_message', processedAt: null },
    }),
  // Busy ⇔ the latest turn_start has no following turn_complete / turn_error.
  isBusy: async sessionId => {
    const lastStart = await prisma.sessionEvent.findFirst({
      where: { sessionId, type: 'turn_start' },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })
    if (!lastStart) return false
    const closer = await prisma.sessionEvent.findFirst({
      where: {
        sessionId,
        sequence: { gt: lastStart.sequence },
        type: { in: ['turn_complete', 'turn_error'] },
      },
      select: { id: true },
    })
    return closer === null
  },
})
