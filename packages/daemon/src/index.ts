import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { startDaemon } from './server.ts'
import { createPrismaStore } from './store/prisma-store.ts'

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))
const daemon = await startDaemon({ store, port: config.port })
console.log(`baton daemon listening on :${daemon.port}`)

const shutdown = async () => {
  await daemon.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
