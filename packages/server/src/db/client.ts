import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Build PrismaClient with the node-postgres driver adapter (no Rust query engine).
export const createPrisma = (url: string): PrismaClient =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
