import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { issueToken } from './store/prisma/codec.ts'
import { createPrismaStore } from './store/prisma-store.ts'

// Mint (or rotate) a personal API token for a user — a machine credential for
// the DingTalk bridge / CLI, sent as `Authorization: Bearer <token>`. Prints it
// ONCE. Usage: pnpm --filter @baton/server token <username>
const username = process.argv[2]
if (!username) {
  console.error('usage: token <username>')
  process.exit(1)
}

const store = createPrismaStore(createPrisma(loadConfig().databaseUrl))
const user = await store.users.getByUsername(username)
if (!user) {
  console.error(`no such user: ${username} — create it first (seed:user)`)
  await store.close()
  process.exit(1)
}
const token = issueToken()
await store.users.setApiToken(user.id, token)
console.log(`API token for "${username}" (id=${user.id}) — store it now, shown once:`)
console.log(token)
await store.close()
