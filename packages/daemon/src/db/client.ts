import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '@prisma/client'

// Build PrismaClient with the libsql driver adapter (Node-compatible, no Rust query engine).
export const createPrisma = (url: string): PrismaClient => {
  const adapter = new PrismaLibSql({ url })
  return new PrismaClient({ adapter })
}
