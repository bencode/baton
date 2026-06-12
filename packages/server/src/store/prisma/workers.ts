import type { PrismaClient } from '@prisma/client'
import { toWorker } from '../mappers.ts'
import type { Store } from '../types.ts'
import { issueToken } from './codec.ts'

export const prismaWorkers = (prisma: PrismaClient): Store['workers'] => ({
  // Identity-recovery algorithm (simplified for M2.9 — no more closedAt filter):
  //   1) (projectId, machineId) → re-attach, update name if changed
  //   2a) no name match → create
  //   2b) name match with empty machineId → legacy claim, fill machineId
  //   2c) name match with different machineId → name-collision
  // 'created' / 'reattached-machine' / 'claimed-legacy' / 'name-collision'
  register: async input =>
    prisma.$transaction(async tx => {
      const byMachine = await tx.worker.findFirst({
        where: { projectId: input.projectId, machineId: input.machineId },
      })
      if (byMachine) {
        const updated =
          byMachine.name !== input.name || byMachine.hostname !== input.hostname
            ? await tx.worker.update({
                where: { id: byMachine.id },
                data: { name: input.name, hostname: input.hostname },
              })
            : byMachine
        return { kind: 'reattached-machine', worker: toWorker(updated), apiToken: updated.apiToken }
      }
      const byName = await tx.worker.findFirst({
        where: { projectId: input.projectId, name: input.name },
      })
      if (!byName) {
        const created = await tx.worker.create({
          data: {
            projectId: input.projectId,
            machineId: input.machineId,
            name: input.name,
            hostname: input.hostname,
            apiToken: issueToken(),
          },
        })
        return { kind: 'created', worker: toWorker(created), apiToken: created.apiToken }
      }
      if (byName.machineId === '') {
        const claimed = await tx.worker.update({
          where: { id: byName.id },
          data: { machineId: input.machineId, hostname: input.hostname },
        })
        return { kind: 'claimed-legacy', worker: toWorker(claimed), apiToken: claimed.apiToken }
      }
      return { kind: 'name-collision', existing: toWorker(byName) }
    }),
  get: async id => {
    const r = await prisma.worker.findUnique({ where: { id } })
    return r ? toWorker(r) : null
  },
  getByToken: async token => {
    const r = await prisma.worker.findUnique({ where: { apiToken: token } })
    return r ? toWorker(r) : null
  },
  findByMachine: async (projectId, machineId) => {
    const r = await prisma.worker.findFirst({ where: { projectId, machineId } })
    return r ? toWorker(r) : null
  },
  listByProject: async projectId =>
    (await prisma.worker.findMany({ where: { projectId }, orderBy: { id: 'asc' } })).map(toWorker),
  listAll: async () => (await prisma.worker.findMany({ orderBy: { id: 'asc' } })).map(toWorker),
  destroy: async id => {
    await prisma.worker.delete({ where: { id } })
  },
})
