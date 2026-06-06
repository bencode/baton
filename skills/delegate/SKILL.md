---
name: delegate
description: >
  Dispatch work to ANOTHER baton worker — same project or any other project:
  list workers, open a session on a chosen worker, hand it a self-contained
  brief, and reply with the session link. Use when the user says "交给 X
  worker / 让强力 worker 来 / 看看有哪些 worker / 列一下所有项目的 worker /
  在 baton 项目开个 session 干活 / delegate this to W-N", or when a task
  clearly exceeds this session's worker and a stronger worker exists.
---

# delegate — hand work to another worker

You are one session on one worker. Other workers in the same project may be
stronger (different model/auth), or sit on different machines with different
repos. Delegation = create a session **on that worker** and send it a brief.
Everything goes through the `baton` CLI (already on PATH); auth is automatic —
bare commands pick up the worker apiToken from the cwd `.baton.json`.

Workers wear a **global W-N handle** (unlike R-N/T-N, which restart per
project): W-7 means the same worker from anywhere, so a number alone is a
complete address.

## Flows

```clojure
(defn list-workers []                       ; "which workers are there?"
  (baton worker ls --json)                  ; this project: [{id, name, hostname, alive…}]
  ;; all projects (discovery chain):
  (baton workspace ls --json)
  (baton project ls --workspace <wid> --json)
  (baton worker ls --project <pid> --json)
  (reply "list with W-<id> handles; mark alive=false as offline"))

(defn delegate [target task]
  ;; 1. resolve target → W-N (int id or name, from `worker ls`)
  ;; 2. create the session ON that worker; no --project needed — the project
  ;;    is derived from the worker itself:
  (def s (baton session create "<task-slug>" --worker W-<id> --json))
  ;; 3. WAIT for attached before sending — the server 409s messages until the
  ;;    child subscribes, and a cold spawn takes ~10-30s:
  ;;    until baton session get <s.id> --project <s.projectId> --json \
  ;;          | grep -q '"attached": true'; do sleep 5; done   # give up ~60s
  ;; 4. send a SELF-CONTAINED brief — the other worker has NONE of your
  ;;    conversation context. Include: goal, repo paths (its add-dirs differ
  ;;    from yours), acceptance criteria, refs (R-N/T-N/files).
  (baton session send <s.id> "<brief>" --project <s.projectId>)
  ;; 5. reply with the link, do NOT wait for completion
  (reply (str "handed to " target " — https://baton.fmap.dev/s/" (:shareToken s))))

(defn check-progress [session-id]           ; "how is it going?"
  (baton session get <session-id> --project <pid> --json)  ; busy=true → still working
  (reply "status + link"))
```

## Discipline

- **The brief must be self-contained**: the target session cold-starts with
  zero context from your conversation. Goal / paths / acceptance criteria /
  refs in one message — err on the side of too much.
- **Don't wait for results**: send is fire-and-forget. Reply with the link;
  on follow-up questions use `session get` (the `busy` field).
- **Don't pretend an offline worker took the job**: sessions on `alive: false`
  workers can be created but won't attach — say so in the reply.
- **Same-worker "new session" is not delegation**: that's the bridge's `/new`
  command, not this skill.
- Prefer the project's strong worker for complex tasks (e.g. `daily-pro` runs
  a stronger model); when unsure, `worker ls` and ask the user.
- Boundary note: there is no permission boundary today — cross-workspace
  dispatch flows freely. When workspaces become permission boundaries,
  cross-workspace delegation will need an explicit grant while same-workspace
  stays free. Until then, just mention the destination when crossing.
