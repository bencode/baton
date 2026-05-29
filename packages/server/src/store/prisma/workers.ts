import type { PrismaClient } from '@prisma/client'
import { toWorker } from '../mappers.ts'
import type { Store } from '../types.ts'

export const prismaWorkers = (prisma: PrismaClient): Store['workers'] => ({
  // Identity-recovery algorithm:
  //   1) (projectId, machineId) alive → re-attach, update name if changed
  //   2a) no name match → create
  //   2b) name match with NULL machineId → legacy claim, fill machineId
  //   2c) name match with different machineId → name-collision
  register: async input =>
    prisma.$transaction(async tx => {
      const byMachine = await tx.worker.findFirst({
        where: { projectId: input.projectId, machineId: input.machineId, closedAt: null },
      })
      if (byMachine) {
        const updated =
          byMachine.name !== input.name || byMachine.hostname !== input.hostname
            ? await tx.worker.update({
                where: { id: byMachine.id },
                data: { name: input.name, hostname: input.hostname },
              })
            : byMachine
        return { kind: 'reattached-machine', worker: toWorker(updated) }
      }
      const byName = await tx.worker.findFirst({
        where: { projectId: input.projectId, name: input.name, closedAt: null },
      })
      if (!byName) {
        const created = await tx.worker.create({
          data: {
            projectId: input.projectId,
            machineId: input.machineId,
            name: input.name,
            hostname: input.hostname,
          },
        })
        return { kind: 'created', worker: toWorker(created) }
      }
      if (byName.machineId === '' || byName.machineId === null) {
        const claimed = await tx.worker.update({
          where: { id: byName.id },
          data: { machineId: input.machineId, hostname: input.hostname },
        })
        return { kind: 'claimed-legacy', worker: toWorker(claimed) }
      }
      return { kind: 'name-collision', existing: toWorker(byName) }
    }),
  get: async id => {
    const r = await prisma.worker.findUnique({ where: { id } })
    return r ? toWorker(r) : null
  },
  findAlive: async (projectId, machineId) => {
    const r = await prisma.worker.findFirst({
      where: { projectId, machineId, closedAt: null },
    })
    return r ? toWorker(r) : null
  },
  listByProject: async projectId =>
    (await prisma.worker.findMany({ where: { projectId }, orderBy: { id: 'asc' } })).map(toWorker),
  close: async id => {
    await prisma.worker.update({ where: { id }, data: { closedAt: new Date() } })
  },
})
