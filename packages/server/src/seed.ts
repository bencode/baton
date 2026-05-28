import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createPrismaStore } from './store/prisma-store.ts'

// Self-hosting bootstrap: populate baton's own v0.1 iteration as real data
// (lesscap -> baton -> "v0.1 迭代" + the foundation tasks already shipped).
// Idempotent — if the lesscap workspace already exists this is a no-op, so
// re-running never clobbers live data created via the CLI/UI.
// Run once for the demo -> real transition: pnpm --filter @baton/server seed

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))

const existing = await store.workspaces.list()
if (existing.some(w => w.name === 'lesscap')) {
  console.log('already seeded (workspace "lesscap" exists); skipping to protect live data')
  await store.close()
  process.exit(0)
}

// First real seed: clear any prior demo data (cascades to its whole subtree).
for (const w of existing) await store.workspaces.delete(w.id)

const ws = await store.workspaces.create({ name: 'lesscap' })
const project = await store.projects.create({
  workspaceId: ws.id,
  name: 'baton',
  description: 'baton 自身开发：agent 协同执行引擎',
})

const v01 = await store.requirements.create({
  projectId: project.id,
  title: 'v0.1 迭代',
  description:
    'v0.1 = 协同维度管理闭环：CLI 与 Web UI 都能对 Workspace/Project/Requirement/Task 做 CRUD 与状态推进。M2 执行（worker/session）归 v0.2。',
  tags: ['v0.1', 'mvp'],
  resources: [
    { kind: 'doc', uri: 'docs/plans/00-overview.md', label: '总体概念对齐' },
    { kind: 'doc', uri: 'docs/plans/03-web-ui.md', label: 'Web UI 方案' },
  ],
  status: 'active',
})

const m1 = await store.tasks.create({
  requirementId: v01.id,
  title: 'M1 领域模型与持久化',
  spec: 'Workspace/Project/Requirement/Task 模型 + Prisma/libsql + Store port + 契约测',
  requires: ['backend'],
  status: 'done',
})
await store.tasks.create({
  requirementId: v01.id,
  title: 'CLI 管理命令',
  spec: 'W/P/R/T 的 create / ls / get / set-status / rm',
  requires: ['cli'],
  dependsOn: [m1.id],
  status: 'done',
})
const shell = await store.tasks.create({
  requirementId: v01.id,
  title: 'Web 布局外壳',
  spec: 'resizable 分栏 + 多页签 React <Activity> keep-alive + LRU',
  requires: ['frontend'],
  dependsOn: [m1.id],
  status: 'done',
})
const panel = await store.tasks.create({
  requirementId: v01.id,
  title: 'Web 左侧资源面板',
  spec: 'workspace▾/project▾ + Requirements→Tasks 依赖缩进树 + 路径路由 + seed',
  requires: ['frontend'],
  dependsOn: [shell.id],
  status: 'done',
})

await store.close()
console.log('seeded lesscap -> baton -> "v0.1 迭代"')
console.log(`  requirementId = ${v01.id}`)
console.log(`  task "Web 左侧资源面板" id = ${panel.id}  (use as --deps for upcoming work)`)
