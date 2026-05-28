import 'dotenv/config'
import { loadConfig } from './config.ts'
import { createPrisma } from './db/client.ts'
import { createPrismaStore } from './store/prisma-store.ts'

// Self-hosting bootstrap: populate baton's own v0.1 iteration as real data
// (lesscap → baton → "v0.1 迭代" + the foundation tasks already shipped).
// Idempotent — if the lesscap workspace already exists this is a no-op, so
// re-running never clobbers live data created via the CLI/UI.
// Run once for the demo → real transition: pnpm --filter @baton/server seed

const config = loadConfig()
const store = createPrismaStore(createPrisma(config.databaseUrl))

const existing = await store.workspaces.list()
if (existing.some(w => w.name === 'lesscap')) {
  console.log('already seeded (workspace "lesscap" exists); skipping to protect live data')
  await store.close()
  process.exit(0)
}

// First real seed: clear any prior data (cascades through the whole subtree).
for (const w of existing) await store.workspaces.delete(w.id)

const ws = await store.workspaces.create({ name: 'lesscap' })
const baton = await store.projects.create({
  workspaceId: ws.id,
  name: 'baton',
  description: 'baton 自身开发：agent 协同执行引擎',
})

const v01 = await store.requirements.create({
  projectId: baton.id,
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

// Foundation tasks (shipped, status=done). dependsOn carries int ids.
const t1 = await store.tasks.create({
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
  dependsOn: [t1.id],
  status: 'done',
})
const t3 = await store.tasks.create({
  requirementId: v01.id,
  title: 'Web 布局外壳',
  spec: 'resizable 分栏 + 多页签 React <Activity> keep-alive + LRU',
  requires: ['frontend'],
  dependsOn: [t1.id],
  status: 'done',
})
await store.tasks.create({
  requirementId: v01.id,
  title: 'Web 左侧资源面板',
  spec: 'workspace▾/project▾ + Requirements→Tasks 依赖缩进树 + 路径路由 + seed',
  requires: ['frontend'],
  dependsOn: [t3.id],
  status: 'done',
})
await store.tasks.create({
  requirementId: v01.id,
  title: '项目内自增编号与主键自增化',
  spec: 'PK 由 UUID 字符串改为 INT autoincrement；Requirement/Task 新增 project 内唯一的 code (R-N / T-N)；CodeCounter 支撑表承载 next 计数；URL /proj/<id>/<code>',
  requires: ['backend'],
  dependsOn: [t1.id],
  status: 'done',
})

// Second project: baton 的对外门面（介绍站 / 文档库 / 路线图）。
await store.projects.create({
  workspaceId: ws.id,
  name: 'compass',
  description: 'baton 的对外门面：介绍站 + 文档库 + 未来发展方向',
})

await store.close()
console.log('seeded lesscap → baton → "v0.1 迭代"')
console.log(`  workspaceId = ${ws.id}`)
console.log(`  baton projectId = ${baton.id}`)
console.log(`  v0.1 requirementId = ${v01.id} (code R-1)`)
console.log(`  tasks T-1..T-5 created as done`)
