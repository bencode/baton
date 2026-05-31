import type { PrismaClient } from '@prisma/client'
import { toTaskComment } from '../mappers.ts'
import type { Store } from '../types.ts'

// Append-only comment log on a Task. Each comment is a single INSERT (no
// read-modify-write, so concurrent authors never clobber each other) and is
// immutable once written; listByTask returns them in insertion order.
export const prismaTaskComments = (prisma: PrismaClient): Store['taskComments'] => ({
  create: async input =>
    toTaskComment(
      await prisma.taskComment.create({
        data: { taskId: input.taskId, body: input.body, workerId: input.workerId },
      }),
    ),
  listByTask: async taskId =>
    (await prisma.taskComment.findMany({ where: { taskId }, orderBy: { id: 'asc' } })).map(
      toTaskComment,
    ),
})
