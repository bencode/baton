# 01 · M1 设计 · 核心模型 + 持久化 + daemon 骨架

> **草稿声明**：本仓库 `docs/` 皆为草稿，供回顾对齐；真正产物是「业务代码 + 用代码实现的 harness」。
> 当代码与本文冲突时以代码为准，并回头修订本文。
> 承接 `00-overview.md`（总体概念）。协作模型：**agent 经 skill / worker 认领任务**（claim 语义，非 push）。

## Context

baton 的地基。先有一套能被反复运行、能被 harness 验证的**领域模型 + 持久化**，
daemon 作为常驻进程持有这套状态。这是后续认领调度、worker 协作、自举的承重墙。

## 范围 / 非范围

**M1 范围**：静态协同模型（Workspace/Project/Requirement/Task）+ 纯派生函数、
Prisma+SQLite 持久化（Store port + 契约 harness）、daemon 骨架（Bun + 最小 HTTP CRUD + 优雅启停）。
**明确不在 M1**：**执行追踪 Assignment / Session / 认领 claim / 租约 lease / sweeper**——
这套与 CLI worker 的注册/运行方式强耦合，**并入 M2**（见末尾「M2 前瞻」已捕获方向）。
worker WS/SSE 连接（M2）、真 agent worker（M3）、planning 拆解（M4）、渠道（M5）、Web（M6）同样后续。

## 包结构（pnpm monorepo，工具链已落）

```
baton/
  package.json / pnpm-workspace.yaml / biome.json / tsconfig.base.json   ← 已写
  packages/
    shared/   @baton/shared   领域类型 + 纯派生函数（无运行时依赖）
    daemon/   @baton/daemon    Node 运行时（tsx）；Prisma + Store + HTTP；持有状态
```

运行时 Node + tsx（直接跑/测 .ts，无构建步），包管理 pnpm，lint/format biome 1.9.4，类型 tsc --noEmit。

## 层级与两维度

```
Workspace（部门/团队空间）
  └ Project（纯聚合/分组，无 status）
      └ Requirement（产品/意图维度，独立 status；含默认「日常维护」兜松散任务）
          └ Task（执行/动态维度；任务间以 dependsOn 构成 DAG）
```

- **Project**：纯聚合，**不背 status**，非生命周期对象。
- **Requirement**：**唯一承载产品维度**——独立存储的 `active/done/cancelled`，人/agent 显式推进，
  受任务进度“启发”不被驱动（全任务 done ≠ 需求 done）。承载上下文（描述/资源引用/标签）。
  每个 Project 自带一个默认 Requirement（如「日常维护」），松散任务有处可挂，"Task 必属于 Requirement"无例外。
- **Task**：执行维度（名字保留 `Task`）。任务间是 **DAG**（dependsOn 有向无环），**增量构建**——
  Plan task 边干边往图里加节点+边。分组归 Requirement、关系归 dependsOn ⇒ **不需要 parentId**。
  （"谁在做 / 哪个会话"属执行追踪，见 M2，不在 Task 上。）

## 建模边界（只入"协同维度"）

baton 只承载**协同/协调维度**（Workspace/Project/Requirement/Task 这套编排状态）。
**产品信息、文档、spec、设计等内容不入模型**——随项目体维护在 **git 仓库**，模型里只存**引用**
（`ResourceRef`：路径/链接），方便 agent 回到当前仓库去看。
**仓库是内容的真相源，baton 是协同状态的真相源**，两者独立、靠引用挂钩。
（推论：`Task.spec` 只是简短指令，不是完整规格。）

## 状态设计（对齐 Helm 扁平看板）

Helm 经验：看板只 `triage/todo/in_prog/done`，不靠堆状态。baton 取最简可行集：
- **Requirement（产品）**：`active → done | cancelled`。
- **Task（执行）**：`todo → in_progress → done | failed | cancelled`。
  - `assigned+running` 合成 `in_progress`；`blocked/ready` **派生不存**（`todo` 且 dependsOn 全 done = ready）；
    `awaiting`（等人）降级为执行细节（M2），不占 Task 状态。

## 核心领域模型（`@baton/shared`）

```ts
type Id = string

type Workspace = { id: Id; name: string; createdAt: number }

// 纯聚合/分组，无独立生命周期（status）。
type Project = { id: Id; workspaceId: Id; name: string; description?: string; createdAt: number }

type ResourceRef = { kind: 'doc' | 'link' | 'file'; uri: string; label?: string }
// 产品/意图维度：独立存储的生命周期；唯一承载产品维度的层。
type RequirementStatus = 'active' | 'done' | 'cancelled'
type Requirement = {
  id: Id; projectId: Id
  title: string; description?: string
  resources: ResourceRef[]; tags: string[]   // 上下文 + 特性标签（指向仓库的引用）
  status: RequirementStatus                    // 独立存储，非派生
  createdAt: number; updatedAt: number
}

// 执行维度，对齐 Helm 扁平看板；blocked/ready 派生不存。
type TaskStatus = 'todo' | 'in_progress' | 'done' | 'failed' | 'cancelled'
type Task = {
  id: Id; requirementId: Id            // 必属于某 Requirement
  title: string; spec?: string         // spec 仅简短指令；完整规格在仓库，靠 Requirement.resources 引用
  requires: string[]                   // 能力标签（含 'planning' ⇒ Plan task）；M2 认领时匹配
  dependsOn: Id[]                       // 前置任务，构成 DAG（增量构建）
  status: TaskStatus
  createdAt: number; updatedAt: number
}

type Worker = { id: Id; name: string; capabilities: string[] }  // 运行时态，不落库（M2）
```

纯派生函数（pure，便于 harness 单独验证）：
- `summarizeTaskProgress(tasks) -> { total; done; inProgress; failed }`
  （进度概览，仅“启发”需求状态、供展示；不等于也不改写 RequirementStatus）
- `dependenciesMet(task, byId) -> boolean`（dependsOn 全 done）
- `isReady(task, byId) -> boolean`（status==='todo' 且 dependenciesMet —— ready 不存储，按需算）
- `isTerminal(status) -> boolean`（done/failed/cancelled）

## 持久化：Prisma + SQLite，藏在 Store port 之后

**落库实体（M1）**：Workspace / Project / Requirement / Task（Assignment/Session 在 M2；Worker 不落库）。
status 承载：**Requirement（产品维度）**、Task（执行）；**Project 无 status**。

**SQLite 表要点**：
- `resources / tags / requires / dependsOn` 存 JSON `TEXT`，Store 层负责 (反)序列化；领域类型仍是结构化数组/对象。
- 时间戳：DB 用 `DateTime`（`@default(now())` / `@updatedAt`），Store 映射为领域层 `number`（epoch ms）。
- 外键级联（`onDelete: Cascade` 链）：Workspace → Project → Requirement → Task 逐级级联。
- 索引：Project 按 workspaceId；Requirement 按 projectId / status；Task 按 requirementId / status。

**Store port（接口，全异步——为未来换网络型 DB 留口）**：
```ts
type Store = {
  workspaces:  { create; get; list; delete }
  projects:    { create; get; listByWorkspace; delete }
  requirements:{ create; get; listByProject; update; delete }   // update 推进产品维度 status
  tasks:       { create; get; listByRequirement; update; delete }
  getRequirementWithTasks(id): { requirement; tasks }        // 聚合读（算派生状态用）
  close(): Promise<void>
}
```
第一实现 `PrismaStore` 包 Prisma Client，做 行↔领域类型 的映射（含 JSON 字段、DateTime↔number）。

**契约 harness**（`代码+harness` 的 harness 那半，对 port 而非 impl）：
- 每次跑用**全新临时 SQLite 文件**（migrate → 测 → 删），保证可重复、隔离。
- 覆盖：CRUD 往返、JSON 字段 (反)序列化、级联删除（删 Workspace 清空整链）、
  Requirement 独立 status 往返、`summarizeTaskProgress` / `isReady`（DAG 依赖）跑在落库数据上、dependsOn 完整性。
- 用 `tsx --test`（node:test）。

## daemon 骨架（`@baton/daemon`，Node + Hono）

- 进程：tsx 跑 `src/index.ts`（`dotenv` 加载 .env）；读配置（`DATABASE_URL`、`PORT`）。
- 启动：实例化 `PrismaStore` → Hono app 经 `@hono/node-server` 的 `serve()` 起。
- HTTP（最小核心面；连接/认领留 M2）：`GET /health` + workspace/project/requirement/task 的 create/get/list（薄层调 Store）。
- 优雅启停：SIGINT/SIGTERM → `server.close()` + `store.close()`（Prisma disconnect）后退出。
- daemon 自己的 harness：boot→`/health`→建链→读回→关停，验证"进程+Store+HTTP"贯通（含真实 node server 启停）。

## 工具链（已落，参照 tcollab）

biome.json（useImportType error、noExplicitAny error、单引号无分号 trailing-all）、
tsconfig.base.json（strict、bundler、ESNext、noEmit）、pnpm-workspace、根 scripts（typecheck / test / lint / format / check）。

## 验证

```
pnpm install
pnpm --filter @baton/daemon exec prisma migrate dev --name init   # 已生成 init 迁移
pnpm check     # biome + typecheck + test（tsx --test / node:test）一条龙
```

## 运行时与持久化选型（M1 实测结论）

- **运行时用 Node，不用 Bun**：Bun 偏构建期/CLI 工具；长期运行的服务端 daemon 走 Node 更稳、与 tcollab 同栈。
  栈：Node + `tsx`（跑/测 .ts）+ `@hono/node-server` + `node:test`。
  （期间实测 better-sqlite3 原生模块在 Bun 上 ABI 不匹配——NODE_MODULE_VERSION 137 vs 127——是 Bun 兼容缺口的缩影，也促成切 Node。）
- **Prisma 实测 7.8**：强制 driver adapter（url 进 `prisma.config.ts`，无 Rust query engine）。
- **SQLite 暂用 `@prisma/adapter-libsql` + `@libsql/client`**（Node 上正常）；"更好的本地 driver"（如 better-sqlite3，Node 可用）以后再换——Store port 不变，只换 impl。

## 决策记录（M1 均已定）

1. ✅ 层级 **Workspace → Project → Requirement → Task**；Project 无 status，Requirement 独占产品维度（`active/done/cancelled`，独立非派生）。
2. ✅ Task（保留此名）执行维度 `todo/in_progress/done/failed/cancelled`；`blocked/ready` 派生不存。
3. ✅ **dependsOn 构成 DAG、增量构建**；不用 parentId（分组归 Requirement）。每 Project 默认 Requirement（「日常维护」）兜松散任务。
4. ✅ **只建协同维度**：产品内容（doc/spec/设计）不入模型，随 git 仓库维护，模型只存引用（ResourceRef）。
5. ✅ 持久化 **SQLite** via Prisma，藏在 Store port 后；数组/对象字段 JSON 文本列 + Store 映射。
6. ✅ Worker 运行时/ephemeral 不落库；无漂移型冗余（无 assigneeWorkerId 等）。
7. ✅ **Assignment / Session / 认领 / 租约移出 M1，并入 M2**（与 CLI 注册/运行方式一起设计）。

## M2 前瞻（已理清的方向，留给 M2 起步，不在 M1 落地）

- **两端**：daemon（服务端，持有状态/API）；CLI（客户端），两种消费模式：
  - **worker 模式**：CLI 常驻，经 SSE/WS 注册能力、保持连接、认领 ready 任务、跑 claude-code session 执行。**连接=liveness**。
  - **skill 模式**：经 claude-code/cursor 把 baton 当 skill，临时认领 task、在自己会话里做完、回报（也能查信息）。**无常驻连接**。
- **Session = 工作会话，租约持有者，1—* Assignment**（一会话可领多任务）；**Session 落库 = "映记"**（持久化 sessionId + lease，重启可还原追踪、sweep 僵尸）；Worker 不做独立持久实体（worker 模式 = 长连 Session）。
- **Assignment = 会话内一次任务执行**：`{ taskId, sessionId, status: running|done|failed|abandoned, result?, startedAt, endedAt? }`。
- **两种 liveness**：worker 靠连接断开即判死；skill 靠心跳/认领超时。**lease = Session.heartbeatAt + sweeper**，失活 → 名下 running Assignment 置 `abandoned`、Task 回 `todo`（重认领）。
- **认领状态转移**：认领 → Task `todo→in_progress` + 建 running Assignment；成功→`done`；失败重试用尽→`failed`；人为放弃→`cancelled`。

## 开放 / 延后

- 协作模型 push→claim 的细化在 M2；据此回写 `00-overview.md` 调度章节。
- Plan task 产出子任务的"血缘"是否需显式记录（当前靠 requirementId 同组 + dependsOn）。
- `RequirementStatus` 是否补 `draft`；重认领次数上限/退避（M2）。
