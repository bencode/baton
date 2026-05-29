# baton — worker 接活、协同绑定与权限 · 模块设计

> **草稿声明**：仓库里所有 docs 的身份都是**草稿**，供回顾与对齐使用。
> baton 真正的产物 = 「业务代码 + 用代码实现的 harness 设施」。文档不是产物本身；
> 当代码与本文冲突时，以代码为准，并回头修订本文。
>
> **本文性质**：把"主流程"里悬而未决的一块敲成共识基线——session 怎么"接活"、
> 协同维度的"谁在执行哪个 task"这条边、agent 的权限策略、以及远程建 worker 的边界。
> 只对齐方向 + 给出可动工切口，不在本篇写实现代码。

## 1. Context（为什么写这篇）

主流程已经跑通一半：`baton start` 在机器上自动注册 worker、建 git worktree、创建 session、
起 daemon 循环（心跳 + SSE 订阅 + drain → 每条 user_message spawn 一次 `claude --print`）。

但还有四个口子没封：

1. **接活没固定**：session 能跑，但它跟 Requirement / Task **没有任何关联**。
   想让某个 worker "实现 T2、T3"，目前只能临时发一句自然语言 prompt，流程没沉淀下来。
2. **协同维度缺一条边**：数据模型里没有"session 正在执行 task"的记录。
   `task.status` 能变 `in_progress`，但"谁在执行"无从查——协同无从谈起。
3. **权限是 YOLO**：spawn claude 时带了 `--dangerously-skip-permissions`，全放行，长期不安全。
4. **远程建 worker 的诉求**：Project/Requirement/Task 都是 DB 记录、可远程创建；
   但 worker 跟本地环境绑定，远程建不出来。

讨论中纠正过一个误判：**"工具层"并不是空白**。spawn 出来的是完整的 Claude Code，
本身带全套工具、MCP、skills。真正缺的只有协同边（Assignment）。详见决策一、二。

## 2. 现状事实锚点（以代码为准）

- **spawn 形态**（`packages/cli/src/session/runner/log.ts` 的 `buildClaudeArgs`、`runner/spawn.ts`）：
  ```
  claude --print
         --resume | --session-id <agentSessionId>
         --output-format stream-json --verbose
         --dangerously-skip-permissions
         <text>
  ```
  `cwd = worktreePath`，env 继承 `process.env` + 可选 overlay。**没有** `--mcp-config` /
  `--allowedTools` / skill / append-system-prompt 注入。
- **完整的 Claude Code，非 SDK 裸调**：跑在机器上、当前用户身份、worktree 目录里，
  自动继承 `~/.claude/settings.json`（含 MCP servers）、全局 / 项目级 skills、
  `~/.claude/CLAUDE.md` 与仓库内 `CLAUDE.md`/`.claude/`，外加全套内置工具（Bash/Read/Write/…）。
- **worktree**（`packages/cli/src/session/worktree.ts`）：
  `git worktree add -b baton/<sessionCode> <path> <base>`。worktree 由 baton 在 provision 时建。
- **数据模型现状**（`packages/server/prisma/schema.prisma`）：
  Session FK→Worker、Task FK→Requirement、Worker FK→Project。**无 Assignment 实体**。
- **鉴权**：Session 持 `apiToken`（bearer，仅注册时返回一次）做 session 级写；
  项目级读在 v0 单租户下开放（`middleware/auth.ts`）。
- **claimed-legacy hook**（`packages/server/src/store/prisma/workers.ts` Rule 2b）：
  name 先建、machineId 留空的 worker，可被机器后续 `worker register` 认领填充。

## 3. 决策一 · 接活 = skill + baton CLI（pull，内容住 git）

**结论：不造工具层，造一个 baton skill + 让 session 里的 baton CLI 有上下文。**

- agent 已有全套工具；**baton 自己的 CLI 就是最完整的工具契约**，
  agent 直接在 Bash 里 `baton task get T2 --json`、`baton task set-status T2 in_progress` 即可。
  这与 "CLI-complete / 无头路径永远在" 的原则一致。
- 写一个 **baton skill**，把接活 loop 固化下来：
  > 接 task → 读 `task.spec`（短指令）+ `requirement.resources`（指向 git 的 ResourceRef）
  > → 从 worktree 里已 checkout 的仓库拉真正的 spec → 实现 → claim / 回状态。
- **pull 而非 push**：内容（spec/doc/设计）住 git，模型只存引用，**不要**把整篇 spec 塞进 prompt。
- **worktree 注入 baton CLI 上下文**：provision 时往 worktree 落一份配置或 env，
  让 baton CLI 知道 server / projectId / sessionId / apiToken（"我是哪个 session"）。
- **派活暂手动**：发消息"处理 T2、T3"即可触发；server 端 push 调度留后续模块（见 overview M2/M4）。
- **MCP server 是可选升级**（"打字更稳"的有类型工具面），非前提；CLI + skill 是 baton-idiomatic 的最短路径。

## 4. 决策二 · Assignment 协同边（唯一真缺口）

无论接活走 CLI 还是 MCP，都绕不开 server 端的 `session ↔ task` 绑定。这是模型里唯一真缺的东西，
overview 早已预留。

- **模型**：
  ```
  Assignment {
    id, taskId, sessionId,
    status: 'running' | 'done' | 'failed' | 'abandoned',
    createdAt, updatedAt
  }
  ```
- **工具契约**：`baton task claim T2` → 建 Assignment 绑 session↔task；
  状态经 CLI（`set-status`）回流，并相应推进 task 的状态机。
- **派生 / 活性**："谁在执行"从 Assignment 查；活性复用 session 心跳判活；
  孤儿 Assignment（session 挂了但状态还 running）的 sweeper 留后续模块。
- **可动工切口**（下一模块再动手）：
  `shared` domain type（assignment.ts）→ `prisma/schema.prisma` →
  `store/types.ts` + `store/prisma/` → `routes/tasks.ts`（claim 端点）→ `cli task claim`。

## 5. 决策三 · 权限分层（去 YOLO）

前提：`claude --print` 是无头、无 TTY 模式，**跑的时候没人能点"允许"**。
`--dangerously-skip-permissions` 只是图省事的全放行。无头模式下的正经替代有三层，可叠加：

- **L1 · 最小权限白名单（先做）**：
  provision worktree 时写一份 per-session 的 `.claude/settings.json`（`permissions.allow / deny`），
  或用 `--allowedTools "Read" "Edit" "Bash(baton:*)" "Bash(git:*)" …`；
  同时去掉 `buildClaudeArgs` 里的 `--dangerously-skip-permissions`。
  worktree 本就是 baton 建的，顺手落权限文件，零额外通道；未授权工具在无头模式下**直接被拒、不挂起**。
- **L2 · 审批回流 baton（目标设计）**：
  `--permission-prompt-tool mcp__baton__approve` —— 把"要不要放行"委托给 baton 的 MCP 工具；
  risky 调用（任意 Bash、网络、破坏性 fs）升级为"待审批"事件 → 经 web UI / 渠道推给人 → 决策回流。
  这正对应 overview "人工介入点：审批是任务的一种待人确认状态，经渠道回推"——
  **安全与协同是同一个机制**，是最值得演进的方向。
- **L3 · 沙箱隔离（scale 时上）**：
  worktree 只隔离了 git，没隔离文件系统 / 网络。多 worker 并行时给 agent 进程套受限环境
  （容器 / 受限用户 / 网络出口策略），即使白名单内的 Bash 被误用也炸不到宿主。

**节奏**：短期上 L1（几乎零成本，立刻去 YOLO）；L2 作为目标设计（一鱼两吃，兼做 human-in-the-loop）；
L3 等真正 scale 再上。

## 6. 决策四 · 远程 Worker = 维持手动（+ 说明）

- **为何不能纯远程建**：Worker 不是一行 DB 记录，而是"一台机器 + 文件系统 + git 仓库上的活进程"
  （`(projectId, machineId)` 绑定，machineId 落在 `~/.local/share/baton/machine-id`）。
  远程 API 能建出 Worker 行，但没有活 daemon 的行是死的（UI 里 `alive=false`），变不出真实能力。
- **标准开机流程**：在目标机器上、repo 目录里跑 `baton start`
  （auto-register worker + 建 session + 起 daemon），这是唯一能让 worker 真正"活"的路径。
- **已有 hook（可远程预声明占位）**：claimed-legacy 支持 name 先建、machineId 留空——
  创建项目时可远程把 worker"占位"建出来；机器侧 `baton worker register --name X` 时认领填充。
  但仍需机器上手动激活，不改变"必须有进程跑在机器上"这一事实。
- **长期方向（不在本轮）**：持久化的机器级 **host agent** —— 机器注册一次 + 保持控制长连接，
  server 可下发"为项目 P 备好 worker+session（定位/clone 仓库、建 worktree、起 session）"。
  这条控制通道同时也是 **L2 审批回流** 与 **server push 派活** 的共同载体（overview 已埋点）。

## 7. 这篇不解决什么 / 模块边界

- 不做 server 端 push 调度（能力匹配 + 依赖就绪自动派发）。
- 不做 host agent 与控制通道。
- 不做孤儿 Assignment 的 sweeper。
- 不做 L2 审批回流 / L3 沙箱的实现。
- 本篇只对齐方向，并给出**两个可立即动工的切口**：L1 权限白名单、Assignment 协同边。

## 8. 与 overview 的衔接

本篇细化的都是 `00-overview.md` 已埋点、留给"对应模块动工时拍板"的开放问题：
- Assignment / 认领 / 租约 → 决策二。
- worker 容错（孤儿、租约）→ 决策二（sweeper 留后续）。
- 人工介入点 / 审批经渠道回推 → 决策三 L2。
- 隔离与工作目录 → 决策三 L1/L3。
- worker 经长连接保持在线、引擎经此下发 → 决策四长期方向（host agent）。
