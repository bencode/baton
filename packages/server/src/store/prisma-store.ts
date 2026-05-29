import type { PrismaClient } from '@prisma/client'
import { toRequirement, toTask } from './mappers.ts'
import { prismaProjects } from './prisma/projects.ts'
import { prismaRequirements } from './prisma/requirements.ts'
import { prismaSessions } from './prisma/sessions.ts'
import { prismaTasks } from './prisma/tasks.ts'
import { prismaWorkers } from './prisma/workers.ts'
import { prismaWorkspaces } from './prisma/workspaces.ts'
import type { Store } from './types.ts'

// PrismaStore: first implementation of the Store port. Each resource slice
// lives in prisma/<name>.ts and returns its sub-shape of Store; this file
// stitches them together and handles the cross-cutting helpers.
export const createPrismaStore = (prisma: PrismaClient): Store => ({
  workspaces: prismaWorkspaces(prisma),
  projects: prismaProjects(prisma),
  requirements: prismaRequirements(prisma),
  tasks: prismaTasks(prisma),
  sessions: prismaSessions(prisma),
  workers: prismaWorkers(prisma),
  getRequirementWithTasks: async id => {
    const r = await prisma.requirement.findUnique({ where: { id }, include: { tasks: true } })
    if (!r) return null
    return { requirement: toRequirement(r), tasks: r.tasks.map(toTask) }
  },
  close: async () => {
    await prisma.$disconnect()
  },
})
