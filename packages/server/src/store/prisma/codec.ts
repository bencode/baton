import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

const PREFIX = { requirement: 'R', task: 'T' } as const
export type Kind = keyof typeof PREFIX

// Atomic per-(project, kind) counter increment via upsert. First-ever use of a
// kind creates the row at next=2 (consumed 1); subsequent uses bump by 1.
export const nextCode = async (tx: TxClient, projectId: number, kind: Kind): Promise<string> => {
  const c = await tx.codeCounter.upsert({
    where: { projectId_kind: { projectId, kind } },
    update: { next: { increment: 1 } },
    create: { projectId, kind, next: 2 },
    select: { next: true },
  })
  return `${PREFIX[kind]}-${c.next - 1}`
}

export const issueToken = (): string => randomBytes(32).toString('base64url')
