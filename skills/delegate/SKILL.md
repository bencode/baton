---
name: delegate
description: >
  Dispatch work to ANOTHER baton worker — same project or any other project
  (--project addressing): list workers, open a session on a chosen worker,
  hand it a self-contained brief, and reply with the session link. Use when
  the user says "交给 X worker / 让强力 worker 来 / 用 daily-pro 做 / 看看有
  哪些 worker / 列一下所有项目的 worker / 在 baton 项目开个 session 干活 /
  delegate this", or when a task clearly exceeds this session's worker and a
  stronger worker exists.
---

# delegate — hand work to another worker

You are one session on one worker. Other workers in the same project may be
stronger (different model/auth), or sit on different machines with different
repos. Delegation = create a session **on that worker** and send it a brief.
Everything goes through the `baton` CLI (already on PATH; `.baton.json` in your
worktree scopes server/project automatically).

## 鉴权（CLI ≤0.1.x 需要；新版 clientFor 自动回退后可省）

The server gates reads behind auth; your worktree's `.baton.json` carries the
worker apiToken. Export it once per shell before the baton calls below:

```bash
export BATON_TOKEN=$(node -e 'console.log(require("./.baton.json").worker.apiToken)')
```

## 流程

```clojure
(defn list-workers []                       ; "有哪些 worker?"
  (baton worker ls --json)                  ; [{id, name, hostname, alive…}]
  (reply "worker 列表 + 哪个适合干什么"))   ; alive=false 的标注"离线"

(defn delegate [target task]
  ;; 1. resolve target: int id or name, from `worker ls` output
  ;; 2. create the session ON that worker (name it after the task, short)
  (def s (baton session create "<task-slug>" --worker <id> --json))
  ;; 3. WAIT for attached before sending — the server 409s messages to a
  ;;    session whose child hasn't subscribed yet, and a cold spawn takes
  ;;    ~10-30s. Poll `session get` until attached (give up after ~60s):
  ;;    until baton session get <s.id> --json | grep -q '"attached": true'
  ;;      do sleep 5; done
  ;; 4. send a SELF-CONTAINED brief — the other worker has NONE of your
  ;;    conversation context. Include: goal, repo paths (its add-dirs may
  ;;    differ from yours), acceptance criteria, and any refs (R-N/T-N/files).
  (baton session send <s.id> "<brief>")
  ;; 5. reply with the link, do NOT wait for completion
  (reply (str "已交给 " target " — https://baton.fmap.dev/s/" (:shareToken s))))

(defn check-progress [session-id]           ; 用户追问"做得怎么样了"
  (baton session get <session-id> --json)   ; busy=true → 还在干
  (reply "状态 + 链接"))

(defn delegate-cross-project [hint task]    ; 目标 worker 不在你的项目里
  ;; Worker 编号 W-N 是全局的（不像 R-N/T-N 按项目重新编号）——拿到编号
  ;; 就是完整地址：`session create --worker W-N` 会自动落到该 worker 自己
  ;; 的项目，无需 --project（CLI ≥0.2.5）。
  ;; 发现链（用户只给了模糊指向如"baton 项目的那个 worker"时）：
  (baton workspace ls --json)               ; → workspace ids
  (baton project ls --workspace <wid> --json)
  (baton worker ls --project <pid> --json)  ; → 报给用户时用 W-<id> 称呼
  (def s (baton session create "<task-slug>" --worker W-<id> --json))
  ;; 后续 send/get 仍带 --project <pid>（从 create 返回的 projectId 读）。
  ;; 旧版 CLI（≤0.2.4）：create 也显式带 --project <pid>。
  ;;
  ;; 边界注记：今天没有任何权限边界，跨 workspace 派活畅通无阻；将来
  ;; workspace 成为权限边界后，跨 workspace 的 delegation 需要显式授权，
  ;; 同 workspace 内保持自由。报告里跨 workspace 时点一句去向即可。
  )
```

## 纪律

- **Brief 必须自包含**：对方 session 是冷启动，没有你的上下文。目标 / 路径 /
  验收标准 / 引用一次说清，宁长勿缺。
- **不要等结果**：send 是 fire-and-forget。回复用户链接即可；追问进度再
  `session get`（`busy` 字段）。
- **不要替离线 worker 接单**：`alive: false` 的 worker 照样能建 session（消息
  排队），但要在回复里说明"该 worker 当前离线，消息已排队"。
- **同 worker 不算 delegation**：用户只是要新会话时（"重新开一个"），那是
  bridge 的 `/new`，不是这个 skill。
- 复杂任务优先选项目里的强力 worker（如 daily 项目的 `daily-pro`，跑
  reclaude）；不确定就 `worker ls` 后问用户。
