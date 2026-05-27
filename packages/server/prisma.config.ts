import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// Prisma 7: the connection url moves from the schema to here; the runtime PrismaClient gets a driver adapter separately.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
})
