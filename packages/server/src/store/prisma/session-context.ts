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
  // Every loop on the session counts runs in the current context; a clear (manual
  // or by any loop) starts that count over.
  await tx.loop.updateMany({ where: { sessionId }, data: { runsSinceClear: 0 } })
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

// Counts one delivered loop run and, when this loop has reached its clear-every
// count, clears the context first so this run starts the new context (count 1).
// A run that replaces this loop's still-pending input doesn't count: the replaced
// one never ran. Clearing waits for an idle session (no open turn, no pending
// input) and is skipped while a terminal is attached (allowClear false).
// Caller holds the Session lock throughout the reset and input enqueue.
export const advanceLoopRun = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
  loopId: number,
  opts: { allowClear: boolean; replaced: boolean },
): Promise<SessionEvent[]> => {
  const loop = await tx.loop.findUnique({ where: { id: loopId } })
  if (!loop || loop.sessionId !== sessionId || !loop.enabled || loop.clearEveryRuns === null)
    return []
  if (opts.replaced) return []
  const events =
    opts.allowClear && loop.runsSinceClear >= loop.clearEveryRuns
      ? await clearIfIdle(tx, sessionId)
      : []
  await tx.loop.update({
    where: { id: loopId },
    data: { runsSinceClear: { increment: 1 } },
  })
  return events
}

const clearIfIdle = async (
  tx: Prisma.TransactionClient,
  sessionId: number,
): Promise<SessionEvent[]> => {
  const session = await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
  if (!session.agentSessionId || session.contextResetRequested) return []
  if (await tx.sessionTurn.findUnique({ where: { openKey: String(sessionId) } })) return []
  if (await tx.sessionPendingInput.count({ where: { sessionId } })) return []
  await tx.session.update({ where: { id: sessionId }, data: { contextResetRequested: true } })
  return resetContext(tx, sessionId)
}
