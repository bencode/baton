import { agentMessageText, type UserMessagePayload } from '@baton/shared'
import type { PrismaClient, SessionEvent } from '@prisma/client'
import type { FinishedTurn, Store } from '../types.ts'

const CURSOR_ID = 1

type TurnEndPayload = { turnId: number; attemptId: number; retrying?: boolean; message?: string }

// Item frames replace earlier frames of the same item, so the last agent_message
// frame of the attempt is the final reply.
const lastReply = (payloads: string[]): string | null =>
  payloads.flatMap(p => agentMessageText(JSON.parse(p)) ?? []).at(-1)?.text ?? null

export const prismaPush = (prisma: PrismaClient): Store['push'] => {
  const toFinishedTurn = async (event: SessionEvent): Promise<FinishedTurn> => {
    const end = JSON.parse(event.payload) as TurnEndPayload
    const turn = await prisma.sessionTurn.findUniqueOrThrow({
      where: { id: end.turnId },
      include: { session: { include: { project: true } } },
    })
    const message = await prisma.sessionEvent.findUniqueOrThrow({
      where: {
        sessionId_sequence: { sessionId: turn.sessionId, sequence: turn.userEventSequence },
      },
    })
    const request = JSON.parse(message.payload) as UserMessagePayload
    const frames = await prisma.sessionEvent.findMany({
      where: { attemptId: end.attemptId, type: 'agent_event' },
      orderBy: { sequence: 'asc' },
      select: { payload: true },
    })
    return {
      eventId: event.id,
      type: event.type === 'turn_complete' ? 'turn_complete' : 'turn_error',
      retrying: end.retrying === true,
      ...(end.message ? { errorMessage: end.message } : {}),
      startedAt: turn.createdAt.getTime(),
      finishedAt: turn.finishedAt?.getTime() ?? null,
      session: { id: turn.session.id, name: turn.session.name, projectId: turn.session.projectId },
      projectName: turn.session.project.name,
      planMode: request.planMode,
      senderUserIds: request.senderUserIds ?? [],
      replyText: lastReply(frames.map(f => f.payload)),
    }
  }

  return {
    cursor: async () =>
      (await prisma.pushCursor.findUnique({ where: { id: CURSOR_ID } }))?.lastEventId ?? null,
    setCursor: async eventId => {
      await prisma.pushCursor.upsert({
        where: { id: CURSOR_ID },
        create: { id: CURSOR_ID, lastEventId: eventId },
        update: { lastEventId: eventId },
      })
    },
    latestEventId: async () =>
      (await prisma.sessionEvent.findFirst({ orderBy: { id: 'desc' }, select: { id: true } }))
        ?.id ?? 0,
    finishedTurnsAfter: async (eventId, limit) => {
      const events = await prisma.sessionEvent.findMany({
        where: { id: { gt: eventId }, type: { in: ['turn_complete', 'turn_error'] } },
        orderBy: { id: 'asc' },
        take: limit,
      })
      return Promise.all(events.map(toFinishedTurn))
    },
    subscribe: async (userId, sub) => {
      await prisma.pushSubscription.upsert({
        where: { endpoint: sub.endpoint },
        create: { userId, ...sub },
        update: { userId, p256dh: sub.p256dh, auth: sub.auth },
      })
    },
    unsubscribe: async endpoint => {
      await prisma.pushSubscription.deleteMany({ where: { endpoint } })
    },
    subscriptionsFor: async userIds =>
      prisma.pushSubscription.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, endpoint: true, p256dh: true, auth: true },
      }),
  }
}
