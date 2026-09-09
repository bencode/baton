import type { Prisma, PrismaClient } from '@prisma/client'
import { toPendingInput } from '../mappers.ts'
import type { Store } from '../types.ts'
import { appendSessionEvent, lockSession } from './session-events.ts'

export const queueSnapshot = async (tx: Prisma.TransactionClient, sessionId: number) => {
  const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
  const rows = await tx.sessionPendingInput.findMany({
    where: { sessionId },
    orderBy: { id: 'asc' },
  })
  return { revision: session.queueRevision, items: rows.map(toPendingInput) }
}

export const prismaSessionInputs = (prisma: PrismaClient): Store['inputs'] => ({
  list: sessionId => prisma.$transaction(tx => queueSnapshot(tx, sessionId)),
  submit: (sessionId, input) =>
    prisma.$transaction(async tx => {
      const session = await lockSession(tx, sessionId)
      const replaced =
        input.loopId === undefined
          ? null
          : await tx.sessionPendingInput.findUnique({
              where: { sessionId_loopId: { sessionId, loopId: input.loopId } },
              select: { id: true },
            })
      if (replaced) await tx.sessionPendingInput.delete({ where: { id: replaced.id } })
      const row = await tx.sessionPendingInput.create({
        data: {
          sessionId,
          loopId: input.loopId,
          text: input.text,
          images: JSON.stringify(input.images ?? []),
          attachments: JSON.stringify(input.attachments ?? []),
          replyExpected: input.replyExpected ?? false,
          planMode: session.planMode,
          model: session.model,
          effort: session.effort,
        },
      })
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          paused: false,
          lastActiveAt: new Date(),
          queueRevision: { increment: 1 },
        },
      })
      const event = await appendSessionEvent(tx, sessionId, 'queue_changed', {
        revision: updated.queueRevision,
        addedIds: [row.id],
        ...(replaced ? { cancelledIds: [replaced.id] } : {}),
      })
      return {
        value: {
          input: toPendingInput(row),
          queue: await queueSnapshot(tx, sessionId),
          sinceSequence: event.sequence,
        },
        events: [event],
      }
    }),
  cancel: (sessionId, inputId) =>
    prisma.$transaction(async tx => {
      await lockSession(tx, sessionId)
      const { count } = await tx.sessionPendingInput.deleteMany({
        where: { sessionId, id: inputId },
      })
      if (!count)
        return { value: { removed: false, queue: await queueSnapshot(tx, sessionId) }, events: [] }
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: { queueRevision: { increment: 1 } },
      })
      const event = await appendSessionEvent(tx, sessionId, 'queue_changed', {
        revision: updated.queueRevision,
        cancelledIds: [inputId],
      })
      return {
        value: { removed: true, queue: await queueSnapshot(tx, sessionId) },
        events: [event],
      }
    }),
})
