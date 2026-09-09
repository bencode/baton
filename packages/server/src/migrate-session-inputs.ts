import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { backfillSessionInputs } from './session-input-backfill.ts'

// Maintenance only: stop server, workers and bridges; back up the DB; deploy
// schema; run dry-run then --apply; upgrade all clients before restarting.
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--apply')) throw new Error('usage: db:backfill-inputs [--apply]')
const prisma = createPrisma(loadConfig().databaseUrl)
try {
  console.log(await backfillSessionInputs(prisma, args.includes('--apply')))
} finally {
  await prisma.$disconnect()
}
