import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createPrismaStore } from './store/prisma-store.ts'

// Bind / unbind a user to a workspace (domain membership). A non-admin user only
// sees the workspaces they're bound to; admins see all regardless. Idempotent.
// Usage:
//   pnpm --filter @baton/server bind   <username> <workspace-name>
//   pnpm --filter @baton/server unbind <username> <workspace-name>
const [action, username, workspaceName] = process.argv.slice(2)
if ((action !== 'bind' && action !== 'unbind') || !username || !workspaceName) {
  console.error('usage: bind|unbind <username> <workspace-name>')
  process.exit(1)
}

const store = createPrismaStore(createPrisma(loadConfig().databaseUrl))
const user = await store.users.getByUsername(username)
if (!user) {
  console.error(`no such user: ${username} — create it first (seed:user)`)
  await store.close()
  process.exit(1)
}
const ws = (await store.workspaces.list()).find(w => w.name === workspaceName)
if (!ws) {
  console.error(`no such workspace: ${workspaceName}`)
  await store.close()
  process.exit(1)
}

if (action === 'bind') {
  await store.users.bindWorkspace(user.id, ws.id)
  console.log(`bound "${username}" → workspace "${workspaceName}" (id=${ws.id})`)
} else {
  await store.users.unbindWorkspace(user.id, ws.id)
  console.log(`unbound "${username}" from workspace "${workspaceName}" (id=${ws.id})`)
}
await store.close()
