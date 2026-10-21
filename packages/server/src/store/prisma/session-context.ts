import { randomUUID } from 'node:crypto'
import type { SessionEvent } from '@baton/shared'
import type { Prisma } from '@prisma/client'
import { appendSessionEvent } from './session-events.ts'

export const resetContext = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
): Promise<SessionEvent[]> => {
  const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
  if (!session.contextResetRequested) return []
  const id = randomUUID()
  await tx.session.update({
    where: { id: sessionId },
    data: {
      contextResetRequested: false,
      ...(session.agentSessionId
        ? { agentSessionId: session.agentKind === 'codex' ? `pending:${id}` : id }
        : {}),
    },
  })
  return [await appendSessionEvent(tx, sessionId, 'system', { action: 'context_cleared' })]
}

// Caller holds the Session lock throughout the reset and input enqueue.
export const clearLoopContextIfDue = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
  loopId: number,
  now: number,
): Promise<SessionEvent[]> => {
  const loop = await tx.loop.findUnique({ where: { id: loopId } })
  if (
    !loop ||
    loop.sessionId !== sessionId ||
    !loop.enabled ||
    loop.clearAfterSec === null ||
    loop.nextClearAt === null ||
    loop.nextClearAt.getTime() > now
  )
    return []
  const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
  if (!session.agentSessionId || session.contextResetRequested) return []
  if (await tx.sessionTurn.findUnique({ where: { openKey: String(sessionId) } })) return []
  if (await tx.sessionPendingInput.count({ where: { sessionId } })) return []
  await tx.session.update({ where: { id: sessionId }, data: { contextResetRequested: true } })
  const events = await resetContext(tx, sessionId)
  await tx.loop.update({
    where: { id: loopId },
    data: { nextClearAt: new Date(now + loop.clearAfterSec * 1000) },
  })
  return events
}
