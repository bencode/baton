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
  first: async () => {
    const r = await prisma.user.findFirst({ orderBy: { id: 'asc' } })
    return r ? toUserRecord(r) : null
  },
  count: () => prisma.user.count(),
})
