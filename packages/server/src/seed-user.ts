import 'dotenv/config'
import { hashPassword } from './auth/password.ts'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createPrismaStore } from './store/prisma-store.ts'

// Create one back-office login user. Creating the first user is what flips the
// server into authed mode — the cookie gate enforces once ≥1 user exists. Safe
// to re-run: an existing username is left untouched (never clobbers a password).
// Usage: pnpm --filter @baton/server seed:user <username> <password>
const [username, password] = process.argv.slice(2)
if (!username || !password) {
  console.error('usage: seed:user <username> <password>')
  process.exit(1)
}

const store = createPrismaStore(createPrisma(loadConfig().databaseUrl))
const existing = await store.users.getByUsername(username)
if (existing) {
  console.log(`user "${username}" already exists (id=${existing.id}); left as-is`)
} else {
  const user = await store.users.create({ username, passwordHash: hashPassword(password) })
  console.log(`created user "${username}" (id=${user.id}) — back-office auth is now enforced`)
}
await store.close()
