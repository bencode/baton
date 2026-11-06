import type { PrismaClient } from '@prisma/client'
import { toHost } from '../mappers.ts'
import type { Store } from '../types.ts'
import { issueToken } from './codec.ts'

export const prismaHosts = (prisma: PrismaClient): Store['hosts'] => ({
  create: async ({ name }) => {
    const row = await prisma.host.create({ data: { name, token: issueToken() } })
    return { host: toHost(row), token: row.token }
  },
  get: async id => {
    const row = await prisma.host.findUnique({ where: { id } })
    return row ? toHost(row) : null
  },
  getByToken: async token => {
    const row = await prisma.host.findUnique({ where: { token } })
    return row ? toHost(row) : null
  },
  list: async () =>
    (
      await prisma.host.findMany({
        include: { workspaces: { select: { workspaceId: true }, orderBy: { workspaceId: 'asc' } } },
        orderBy: { id: 'asc' },
      })
    ).map(row => ({ ...toHost(row), workspaceIds: row.workspaces.map(w => w.workspaceId) })),
  listByWorkspace: async workspaceId =>
    (
      await prisma.host.findMany({
        where: { workspaces: { some: { workspaceId } } },
        orderBy: { id: 'asc' },
      })
    ).map(toHost),
  rotateToken: async id => {
    const row = await prisma.host.update({ where: { id }, data: { token: issueToken() } })
    return { host: toHost(row), token: row.token }
  },
  assign: async (hostId, workspaceId) => {
    await prisma.hostWorkspace.upsert({
      where: { hostId_workspaceId: { hostId, workspaceId } },
      create: { hostId, workspaceId },
      update: {},
    })
  },
  unassign: async (hostId, workspaceId) => {
    await prisma.hostWorkspace.deleteMany({ where: { hostId, workspaceId } })
  },
})
