import {
  cancelledMessageIds,
  closesTurn,
  messageLoopId,
  opensTurn,
  startedMessageIds,
  supersededLoopMessageIds,
  unstartedUserMessages,
} from '@baton/shared'
import type { PrismaClient } from '@prisma/client'
import { toSessionEvent } from './store/mappers.ts'

// Run offline, after schema migration and before starting any new binaries.
// One transaction makes both the preflight and the data rewrite all-or-nothing.
export const backfillSessionInputs = (prisma: PrismaClient, apply = false) =>
  prisma.$transaction(
    async tx => {
      const sessions = await tx.session.findMany({
        include: { events: { orderBy: { sequence: 'asc' } } },
      })
      const prepared = sessions.map(session => {
        const events = session.events.map(toSessionEvent)
        const legacy = events.filter(event => event.attemptId === undefined)
        const boundary = legacy.findLast(event => opensTurn(event) || closesTurn(event))
        if (boundary && opensTurn(boundary))
          throw new Error(
            `session #${session.id} has an unfinished legacy turn; stop and settle it before migration`,
          )
        const pending = unstartedUserMessages(events)
        const cancelled = cancelledMessageIds(events)
        const started = startedMessageIds(events)
        const superseded = supersededLoopMessageIds(events)
        const discarded = legacy.filter(
          event =>
            event.type === 'user_message' &&
            !started.has(event.id) &&
            !Array.isArray((event.payload as { inputIds?: unknown } | null)?.inputIds),
        )
        const cancelledIds = discarded
          .filter(event => cancelled.has(event.id))
          .map(event => event.id)
        const supersededIds = discarded
          .filter(event => superseded.has(event.id) && !cancelled.has(event.id))
          .map(event => event.id)
        return { session, pending, cancelledIds, supersededIds }
      })
      const report = {
        sessions: sessions.length,
        pending: prepared.reduce((sum, row) => sum + row.pending.length, 0),
        cancelled: prepared.reduce((sum, row) => sum + row.cancelledIds.length, 0),
        superseded: prepared.reduce((sum, row) => sum + row.supersededIds.length, 0),
        applied: apply,
      }
      if (!apply) return report
      for (const { session, pending, cancelledIds, supersededIds } of prepared) {
        const highwater = session.events.at(-1)?.sequence ?? -1
        await tx.session.update({
          where: { id: session.id },
          data: {
            nextEventSequence: Math.max(session.nextEventSequence, highwater + 1),
            ...(pending.length ? { paused: true, queueRevision: { increment: 1 } } : {}),
          },
        })
        for (const event of pending) {
          const payload = event.payload as {
            text?: string
            images?: string[]
            attachments?: unknown[]
            planMode?: boolean
            model?: string
            effort?: string
          }
          if (!payload || typeof payload.text !== 'string')
            throw new Error(`invalid legacy user_message #${event.id}`)
          await tx.sessionPendingInput.create({
            data: {
              sessionId: session.id,
              loopId: messageLoopId(event),
              text: payload.text,
              images: JSON.stringify(payload.images ?? []),
              attachments: JSON.stringify(payload.attachments ?? []),
              planMode: payload.planMode === true,
              model: payload.model ?? null,
              effort: payload.effort ?? null,
              replyExpected: false,
              createdAt: new Date(event.createdAt),
            },
          })
        }
        await tx.sessionEvent.deleteMany({
          where: {
            sessionId: session.id,
            id: { in: [...pending.map(event => event.id), ...cancelledIds, ...supersededIds] },
          },
        })
      }
      return report
    },
    { timeout: 60_000 },
  )
