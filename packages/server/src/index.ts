import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { startServer } from './server.ts'
import { createPrismaStore } from './store/prisma-store.ts'

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))
// Recover any sessions left 'busy' from a crashed prior process. Worker
// reconnect (M2.5) will re-publish a 'turn_start' if it actually has work,
// so flipping idle here is safe — we don't lose user_messages (they stay
// processedAt=null until a worker explicitly claims them).
const recovered = await store.sessions.resetBusySessions()
if (recovered > 0) console.log(`[boot] reset ${recovered} stale 'busy' session(s) to 'idle'`)
const server = await startServer({ store, port: config.port })
console.log(`baton server listening on :${server.port}`)

const shutdown = async () => {
  await server.stop()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
