import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { startServer } from './server.ts'
import { createPrismaStore } from './store/prisma-store.ts'
import { startSweeper } from './sweeper.ts'

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))
const server = await startServer({ store, port: config.port })
const sweeper = startSweeper(store)
console.log(`baton server listening on :${server.port}`)

const shutdown = async () => {
  sweeper.stop()
  await server.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
