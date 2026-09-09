import type { SessionEventType } from '@baton/shared'
import type { Prisma } from '@prisma/client'
import { toSessionEvent } from '../mappers.ts'

// Acquire the SQLite writer before reading the state used by a transition.
export const lockSession = (tx: Prisma.TransactionClient, id: number) =>
  tx.session.update({ where: { id }, data: { nextEventSequence: { increment: 0 } } })

export const appendSessionEvent = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
  type: SessionEventType,
  payload: unknown,
  attemptId?: number,
) => {
  const session = await tx.session.update({
    where: { id: sessionId },
    data: { nextEventSequence: { increment: 1 } },
  })
  return toSessionEvent(
    await tx.sessionEvent.create({
      data: {
        sessionId,
        sequence: session.nextEventSequence - 1,
        type,
        payload: JSON.stringify(payload),
        attemptId,
      },
    }),
  )
}
