import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { toChannel, toChannelMessage } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaChannels = (prisma: PrismaClient): Store['channels'] => ({
  create: async input => {
    const r = await prisma.channel.create({
      data: {
        workspaceId: input.workspaceId,
        token: randomBytes(32).toString('hex'),
        title: input.title ?? null,
        description: input.description ?? null,
      },
    })
    return { channel: toChannel(r), token: r.token }
  },
  get: async id => {
    const r = await prisma.channel.findUnique({ where: { id } })
    return r ? toChannel(r) : null
  },
  // Update only the provided fields. updateMany (not update) so a vanished row
  // yields count 0 → null, rather than throwing — the route turns that into 404.
  update: async (id, patch) => {
    const { count } = await prisma.channel.updateMany({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
      },
    })
    if (count === 0) return null
    const r = await prisma.channel.findUnique({ where: { id } })
    return r ? toChannel(r) : null
  },
  // Resolve existence (unknown) and token match (ok/forbidden) in one read.
  auth: async (id, token) => {
    const r = await prisma.channel.findUnique({ where: { id }, select: { token: true } })
    if (!r) return 'unknown'
    return r.token === token ? 'ok' : 'forbidden'
  },
  // Append with the next per-channel seq. The read-then-insert runs in a tx so
  // concurrent senders can't collide on the (channelId, seq) unique key — the
  // same guard as sessions.appendEvent. seq is 1-based (relay-compatible).
  appendMessage: async (channelId, input) =>
    prisma.$transaction(async tx => {
      const top = await tx.channelMessage.findFirst({
        where: { channelId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      })
      const row = await tx.channelMessage.create({
        data: {
          channelId,
          seq: (top?.seq ?? 0) + 1,
          sender: input.sender,
          senderKind: input.senderKind,
          text: input.text,
          to: input.to && input.to.length > 0 ? JSON.stringify(input.to) : null,
          attachments:
            input.attachments && input.attachments.length > 0
              ? JSON.stringify(input.attachments)
              : null,
        },
      })
      return toChannelMessage(row)
    }),
  // History strictly after `seq`, ascending, capped — the SSE replay + poll source.
  since: async (channelId, seq, limit = 500) =>
    (
      await prisma.channelMessage.findMany({
        where: { channelId, seq: { gt: seq } },
        orderBy: { seq: 'asc' },
        take: limit,
      })
    ).map(toChannelMessage),
  destroy: async id => {
    await prisma.channel.delete({ where: { id } })
  },
})
