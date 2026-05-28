# 02 · CLI · workspace/project/requirement/task 基本管理

> **草稿声明**：docs 皆草稿，真正产物是「业务代码 + harness」。承接 `01-m1-model-and-persistence.md`。
> 形态：server 提供 HTTP（M1 已有），CLI 是其客户端（API-first / CLI-complete）。
> **状态：已落地**（`@baton/cli`），并端到端实跑通过（起 server → CLI 全流程 → set-status / ls / --json）。

## 范围

- 新包 `@baton/cli`（Node + tsx + **citty**），依赖 `@baton/shared` 类型。
- 资源管理命令（CRUD + requirement/task `set-status`），打 server HTTP。
- **server 启停不入 CLI**——前台 `pnpm --filter @baton/server dev` / 后台交 supervisor（launchd 等）。

## server HTTP 扩展（M1 只有 create/get/list，本轮补齐）

- `DELETE /workspaces|projects|requirements|tasks/:id`（缺则 404）
- `PATCH /requirements/:id`、`PATCH /tasks/:id`（更新 status 等）
（Store 已支持 delete/update，只补薄路由 + 在 server 的 `app.test.ts` 补测。）

## 命令面

```
baton workspace    create <name> | ls | get <id> | rm <id>
baton project      create <name> --workspace <id> | ls --workspace <id> | get <id> | rm <id>
baton requirement  create <title> --project <id> [--desc][--tags a,b] | ls --project <id> | get <id>
                   | set-status <id> <active|done|cancelled> | rm <id>
baton task         create <title> --requirement <id> [--spec][--requires a,b][--deps id1,id2]
                   | ls --requirement <id> | get <id> | set-status <id> <status> | rm <id>
全局：--json（机器可读，给 agent/脚本）、--url（默认 BATON_URL / http://localhost:3280）
```

## 结构

```
packages/cli/src/
  index.ts        citty main，挂载 4 个资源子命令
  config.ts       resolveBaseUrl：--url > BATON_URL > http://localhost:3280
  client.ts       createClient(baseUrl)：fetch 薄封装，方法镜像 server 路由
  output.ts       纯函数：renderOne / renderList（human 行）+ --json 直出
  util.ts         common args（--url/--json）、clientFor、splitCsv
  commands/{workspace,project,requirement,task}.ts   citty defineCommand + 可测 handler
```

- 命令 handler 形态：解析参数 → 调 client → 经 output 渲染（导出 handler 便于 fake-client 测）。
- `--json` 是一等公民（baton 面向 agent，机器可读优先）。

## harness（代码 + harness 一起长）

- `output.ts` 纯函数单测（renderOne/renderList、human 与 json）+ `splitCsv` 单测。
- 命令 handler 用 **fake ApiClient** 单测：断言"参数 → 调对端点 → 渲染输出"。
- server 新增 `DELETE`/`PATCH` 路由在 server 的 `app.test.ts` 补测。
- 端到端（真 CLI → 真 server）已做**手动实跑**验证；自动化 e2e 集成测先不做，需要时再加。

## 决策

1. ✅ CLI 框架 **citty**；运行时 Node + tsx。
2. ✅ **server 启停不入 CLI**（前台 pnpm dev / supervisor 后台）。
3. ✅ `--json` 一等公民；`--url` / `BATON_URL` 配 server 地址（默认本地 3280）。
4. ✅ 为支持 rm/set-status，给 server 补 `DELETE`（四类）+ `PATCH`（requirement/task）路由。

## 开放 / 延后

- 自动化端到端集成测、彩色/表格美化、`baton server` 启停子命令（若日后要 `-d`）。
- task 的认领/Session 相关命令属 M2。
