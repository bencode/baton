import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createPrismaStore } from './store/prisma-store.ts'

// Dev seed: reset the database and create a realistic Workspace -> Project ->
// Requirements -> Task DAG so the UI tree (dependency indentation, status
// badges, ready/blocked) has something to render. Run: pnpm --filter @baton/server seed

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))

// Reset: deleting a workspace cascades to its projects/requirements/tasks.
for (const w of await store.workspaces.list()) await store.workspaces.delete(w.id)

const ws = await store.workspaces.create({ name: 'Engineering' })
const project = await store.projects.create({
  workspaceId: ws.id,
  name: 'web',
  description: 'baton web client',
})

// Requirement with a multi-level DAG: design -> impl -> test, design -> ui,
// then ship depends on test + ui (multi-dependency). Mixed statuses make
// `ui` ready (design done) while `test`/`ship` stay blocked.
const login = await store.requirements.create({
  projectId: project.id,
  title: 'User login',
  description: 'Email + password auth with a session cookie.',
  tags: ['auth'],
  status: 'active',
})
const design = await store.tasks.create({
  requirementId: login.id,
  title: 'Design auth flow',
  status: 'done',
})
const impl = await store.tasks.create({
  requirementId: login.id,
  title: 'Implement login endpoint',
  dependsOn: [design.id],
  status: 'in_progress',
})
const ui = await store.tasks.create({
  requirementId: login.id,
  title: 'Build login form',
  requires: ['frontend'],
  dependsOn: [design.id],
  status: 'todo',
})
const test = await store.tasks.create({
  requirementId: login.id,
  title: 'Write login tests',
  dependsOn: [impl.id],
  status: 'todo',
})
await store.tasks.create({
  requirementId: login.id,
  title: 'Ship login',
  dependsOn: [test.id, ui.id],
  status: 'todo',
})

const dashboard = await store.requirements.create({
  projectId: project.id,
  title: 'Dashboard',
  tags: ['ui'],
  status: 'active',
})
const dashApi = await store.tasks.create({
  requirementId: dashboard.id,
  title: 'Dashboard data API',
  status: 'todo',
})
await store.tasks.create({
  requirementId: dashboard.id,
  title: 'Dashboard widgets',
  dependsOn: [dashApi.id],
  status: 'todo',
})

await store.requirements.create({
  projectId: project.id,
  title: 'Billing',
  description: 'Stripe subscriptions.',
  tags: ['payments'],
  status: 'done',
})

await store.close()
console.log(`seeded workspace ${ws.id}: project "web" with 3 requirements and 8 tasks`)
