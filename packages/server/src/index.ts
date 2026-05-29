import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createLiveness, startLivenessPrune } from './liveness.ts'
import { startServer } from './server.ts'
import { createPrismaStore } from './store/prisma-store.ts'

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))
// Two independent liveness trackers (see app.ts comments): one for worker
// machineId, one for sessionId. Each has its own prune timer.
const workerLiveness = createLiveness()
const sessionLiveness = createLiveness()
const workerPrune = startLivenessPrune(workerLiveness)
const sessionPrune = startLivenessPrune(sessionLiveness)
// No boot-time state recovery: busy is derived from the event log at read
// time; liveness is purely in-memory and naturally resets on boot. Daemons
// that come online re-ping within their next 30s tick.
const server = await startServer({
  store,
  port: config.port,
  workerLiveness,
  sessionLiveness,
})
console.log(`baton server listening on :${server.port}`)

const shutdown = async () => {
  workerPrune.stop()
  sessionPrune.stop()
  await server.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
