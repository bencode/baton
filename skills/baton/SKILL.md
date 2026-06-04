---
name: baton
description: >-
  baton 协同操作 —— 接活（处理 T-N / 实现 R-N）、创建与拆解 Requirement/Task、
  comment 回报进度、推进状态机。当被要求"处理 T-3"、"实现 R-2"、"把这个需求拆成任务"、
  "回报一下进度"、"看看有哪些任务"，或需要在 baton 上创建/更新协同记录时使用。
---

# baton 协同

baton 是协同维度的单一事实源：Requirement（产品意图）→ Task（执行单元）→ Comment（协作记录）。
产品内容（spec/doc/设计）住 git 仓库，baton 只存引用 —— **pull 而非 push**：
拿到引用就去 worktree 里读真文件，不要等人把全文贴给你。

## 上下文（先读）

- cwd 的 `.baton.json` 持有 server / project / worker —— 命令**裸写即可**，
  不需要 `--project` / `--url`（baton 在 provision worktree 时已注入）。
- worker 署名：`jq .worker.id .baton.json` 拿到自己的 worker id，comment 时带 `--worker <id>`。
- 兜底：万一 `.baton.json` 缺失，用 `--project $BATON_PROJECT_ID --url $BATON_URL`。
- 需要解析输出时一律加 `--json`。

## 模型与状态机

```
Project ─► Requirement (R-N)   status: active → done | cancelled   （产品维度，人工推进为主）
              ├─ resources: [{kind: doc|link|file, uri, label}]    （指向 git 的引用，去仓库读）
              └─► Task (T-N)   status: todo → in_progress → done | failed | cancelled
                     ├─ dependsOn: 依赖的 task（依赖未 done = blocked，先做 ready 的）
                     └─► Comment（append-only；文本 + git 引用，不放文件内容）
```

## 命令面

| 命令 | 说明 |
|---|---|
| `baton requirement create <title> [--desc D] [--body MD]` | 建需求，返回 R-N |
| `baton requirement ls` / `get R-N` / `rm R-N` | 列出 / 详情 / 删除 |
| `baton requirement set-status R-N <active\|done\|cancelled>` | 推进需求状态 |
| `baton task create <title> --requirement R-N [--body MD] [--deps T-a,T-b]` | 建任务，返回 T-N |
| `baton task ls --requirement R-N` / `get T-N` / `rm T-N` | 列出 / 详情 / 删除 |
| `baton task set-status T-N <todo\|in_progress\|done\|failed\|cancelled>` | 推进任务状态 |
| `baton task comment add T-N <body> --worker <id>` | 回报（append-only，记得署名） |
| `baton task comment ls T-N` | 按序读协作记录 |

## 流程

```clojure
(defn 接活 [T-N]
  (-> (baton task get T-N --json)              ; title/body = 短指令
      (baton task comment ls T-N --json)       ; 冷启动记忆：先读前任/自己留下的记录
      (baton requirement get R-N --json)       ; 背景 + resources
      (读真-spec :from worktree :via resources) ; 引用指向 git → 直接读文件
      (baton task set-status T-N in_progress)
      (实现)                                    ; 写码/改文件/commit，落在当前 worktree 分支
      (baton task comment add T-N 结果 --worker id) ; 结论 + 文件/commit/分支引用
      (baton task set-status T-N (if 成功 done failed))))

(defn 规划拆解 [需求]
  (-> (baton requirement create title --desc 一句话 --body 详细MD)
      (doseq [t 子任务]                         ; 拆到"一个 session 一口气能做完"的粒度
        (baton task create (:title t) --requirement R-N
               --body (:spec t) --deps (:依赖 t)))
      (回复 "R-N 已拆为 T-x..T-y，依赖关系 ...")))

(defn 进度回报 [T-N]                            ; 长任务中途、或被问"现在怎么样"
  (baton task comment add T-N "已完成…/卡在…/下一步…" --worker id))
```

## 纪律

- **done/failed 前必须有结果 comment**：做了什么、落在哪个分支/commit、怎么验证的。
- comment 写结论 + 引用（文件路径、commit、T-N），不贴大段 spec 或 diff。
- 失败走 `failed` + comment 说明原因，不静默、不假装完成。
- `rm` 类命令不主动用，除非人明确要求删除。
- Requirement 状态以人工推进为主；任务全部 done 时在 comment 里提醒，而不是擅自关 R-N。
