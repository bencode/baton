import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createLiveness, startLivenessPrune } from './liveness.ts'
import { startServer } from './server.ts'
import { createPrismaStore } from './store/prisma-store.ts'

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))
// Worker-machine liveness tracker (see app.ts). Session active-state is tracked
// separately (SessionRuntime, instant via worker reports) and needs no prune.
const workerLiveness = createLiveness()
const workerPrune = startLivenessPrune(workerLiveness)
// No boot-time state recovery: liveness is purely in-memory and resets on boot.
// Workers that come online re-ping within their next 30s tick.
const server = await startServer({
  store,
  port: config.port,
  workerLiveness,
})
console.log(`baton server listening on :${server.port}`)

const shutdown = async () => {
  workerPrune.stop()
  await server.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
