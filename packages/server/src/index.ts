import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createLiveness, startLivenessPrune } from './liveness.ts'
import { startServer } from './server.ts'
import { createPrismaStore } from './store/prisma-store.ts'

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))
const liveness = createLiveness()
const prune = startLivenessPrune(liveness)
// No boot-time state recovery: busy is derived from the event log at read
// time; worker liveness is purely in-memory and naturally resets on boot.
// Daemons that come online re-ping within their next 30s tick.
const server = await startServer({ store, port: config.port, liveness })
console.log(`baton server listening on :${server.port}`)

const shutdown = async () => {
  prune.stop()
  await server.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
