import type { PrismaClient } from '@prisma/client'
import { toLoop } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaLoops = (prisma: PrismaClient): Store['loops'] => ({
  create: async input =>
    toLoop(
      await prisma.loop.create({
        data: {
          sessionId: input.sessionId,
          name: input.name,
          message: input.message,
          intervalSec: input.intervalSec,
          enabled: input.enabled ?? true,
          nextRunAt: new Date(input.nextRunAt),
        },
      }),
    ),
  get: async id => {
    const r = await prisma.loop.findUnique({ where: { id } })
    return r ? toLoop(r) : null
  },
  listBySession: async sessionId =>
    (await prisma.loop.findMany({ where: { sessionId }, orderBy: { id: 'asc' } })).map(toLoop),
  // Scheduler worklist: enabled loops whose nextRunAt has passed, oldest first.
  due: async now =>
    (
      await prisma.loop.findMany({
        where: { enabled: true, nextRunAt: { lte: new Date(now) } },
        orderBy: { nextRunAt: 'asc' },
      })
    ).map(toLoop),
  // undefined patch fields are skipped by Prisma; null clears a nullable column.
  update: async (id, patch) =>
    toLoop(
      await prisma.loop.update({
        where: { id },
        data: {
          name: patch.name,
          message: patch.message,
          intervalSec: patch.intervalSec,
          enabled: patch.enabled,
          nextRunAt: patch.nextRunAt !== undefined ? new Date(patch.nextRunAt) : undefined,
          lastRunAt: patch.lastRunAt !== undefined ? new Date(patch.lastRunAt) : undefined,
          lastStatus: patch.lastStatus,
        },
      }),
    ),
  delete: async id => {
    await prisma.loop.delete({ where: { id } })
  },
})
