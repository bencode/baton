import type { PrismaClient } from '@prisma/client'
import { toUserRecord } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaUsers = (prisma: PrismaClient): Store['users'] => ({
  create: async input => toUserRecord(await prisma.user.create({ data: input })),
  get: async id => {
    const r = await prisma.user.findUnique({ where: { id } })
    return r ? toUserRecord(r) : null
  },
  getByUsername: async username => {
    const r = await prisma.user.findUnique({ where: { username } })
    return r ? toUserRecord(r) : null
  },
  getByApiToken: async token => {
    // findFirst (not unique) — apiToken is @@index'd, 32-byte random ⇒ unique.
    const r = await prisma.user.findFirst({ where: { apiToken: token } })
    return r ? toUserRecord(r) : null
  },
  setApiToken: async (id, token) =>
    toUserRecord(await prisma.user.update({ where: { id }, data: { apiToken: token } })),
  setPassword: async (id, passwordHash) =>
    toUserRecord(await prisma.user.update({ where: { id }, data: { passwordHash } })),
  first: async () => {
    const r = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    return r ? toUserRecord(r) : null
  },
  count: () => prisma.user.count(),
  workspaceIds: async userId =>
    (await prisma.userWorkspace.findMany({ where: { userId }, select: { workspaceId: true } })).map(
      r => r.workspaceId,
    ),
  bindWorkspace: async (userId, workspaceId) => {
    await prisma.userWorkspace.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      create: { userId, workspaceId },
      update: {},
    })
  },
  unbindWorkspace: async (userId, workspaceId) => {
    await prisma.userWorkspace.deleteMany({ where: { userId, workspaceId } })
  },
})
