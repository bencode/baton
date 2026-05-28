# 03 · @baton/web（UI）· workspace/project/requirement/task 管理

> **草稿声明**：docs 皆草稿，真正产物是「业务代码 + harness」。承接 `01`（server）、`02`（CLI）。
> **状态**：应用架子（scaffold）已落地并验证；最终业务界面待设计后再落。

## Context

为"把东西做扎实"，给 baton 加**第二个消费端：Web UI（给人用）**，与 **CLI（给 agent 用）**并行。
两端打**同一套 server HTTP/JSON API**、共享 `@baton/shared` 类型——两个独立消费端互相印证，逼出扎实的接口。

## 决策（已定）

1. UI 自带 `api.ts`（fetch），类型 `import` 自 `@baton/shared`；**不抽共享 client**（两端各写、独立检验）。
2. 栈：React 19 + Vite + Tailwind 4（`@tailwindcss/vite`，无 postcss / 无 tailwind.config）。
3. 连接：Vite dev proxy `/api` → `http://localhost:3280`（`BATON_BACKEND` 可覆盖，rewrite 去 `/api`，changeOrigin）；浏览器 `API_BASE='/api'`；**server 不动、无需 CORS**。
4. harness：`api.ts` 契约测（mock fetch）+ 组件/交互测（vitest + @testing-library/react + jsdom）；`api` 经 `ApiContext` 注入。

## 部署拓扑 & 包边界

- **CLI 独立安装**：`@baton/cli` 依赖要轻、可发布（只 `@baton/shared` 纯类型 + `citty`）。
- **server + UI 同侧部署**：生产很可能由 server 托管构建好的 UI（同源，无需 CORS）。
- **公共库**：`@baton/shared`（types-only）为唯一公共库，三方共享；不新开包。真冒出跨包、领域无关的通用运行时再抽 `@baton/core`。

## 包结构（bulletproof-react · feature-based）

```
packages/web/src/
  main.tsx · styles.css
  app/app.tsx          # 导航状态 + <ApiContext.Provider> + 组织四级；HealthBadge（首屏探 /health）
  api.ts               # createApi(base) 镜像 server 路由；API_BASE='/api'
  app/api-context.ts   # ApiContext / useApi
  components/          # 共享、业务无关 UI（kebab：badge.tsx / resource-list.tsx ...）
  features/<域>/       # 按业务划分，各自包含；不跨 feature 互引（在 app 层组合）
    workspaces|projects|requirements|tasks/  <域>.tsx + use-<域>.ts
  hooks/               # 通用·领域无关 hook
  util/                # 通用·领域无关函数（非组件，按需建）
  domain/              # 仅 web 表现层的领域共享，如 status→色/标签（按需建）
```

**前端约定**：
- 文件/目录 **kebab-case**；组件 `a-b.tsx` 或 `a-b/index.tsx`。
- `components/` 业务无关共享 UI；业务组件进 `features/<域>/`。`hooks/` 业务无关通用 hook；业务 hook 与组件同目录。
- **代码归属**：通用非组件函数→`util/`；**领域相关→优先 `@baton/shared`**；仅 web 表现层的领域共享→`components/`/`domain/`；只属某 feature→`features/<域>/`。
- **feature 自包含、不跨 feature import**；**不用 barrel**（伤 Vite tree-shaking）。
- `api` 经 `ApiContext` 注入（`useApi()`）；测试 `<ApiContext.Provider value={fakeApi}>`。

## UX（四级钻取，v1 用状态、无路由）

- App 持导航状态（selected `workspaceId`/`projectId`/`requirementId`），顶部 Breadcrumb 可上钻。
- 每级：list（req/task 带 status 徽章）+ create 表单 + 行内操作（下钻；req/task set-status；删除）。mutation 后 refetch 当前层。

## 落地顺序

1. ✅ **本轮：应用架子（scaffold）** —— 包 + Vite/Tailwind/vitest 配置 + 目录骨架 + `api.ts` + `ApiContext` + 最小壳（HealthBadge 探 `/health`）。
   验证：typecheck / vitest（7）/ vite build / `pnpm check`（全仓 33）全绿；端到端实跑 `[::1]:5199/api/health → {"ok":true}`（UI→Vite proxy→server 通）。
2. **下一步（你我一起设计）：最终界面** —— 定四级钻取具体形态/交互，落 `features/*` 视图 + 组件 + harness。

## 同步原则（做扎实）

CLI 与 UI 是同一 server HTTP API 的两个独立消费端，共享 `@baton/shared` 类型。新增端点/能力两端都补，互相印证。

## 开放 / 延后

- 鉴权、路由库、富样式、worker 视图（M2）、自动化浏览器 e2e。
- web dev 端口默认 5280（被占自动顺延；注意 vite 默认绑 IPv6 localhost）。
- 生产部署（独立任务）：server 托管 UI 静态产物 + 统一 API base（建议届时 server 路由挪 `/api`）。
