---
name: baton
description: >-
  baton collaboration — pick up work (handle T-N / implement R-N), create and
  decompose Requirements/Tasks, report progress via comments, advance the state
  machines. Use when asked to "handle T-3", "implement R-2", "split this
  requirement into tasks", "report progress", "what tasks are there", or
  whenever collaboration records need creating/updating on baton.
---

# baton collaboration

baton is the single source of truth for the collaboration dimension: Requirement (product intent)
→ Task (execution unit) → Comment (collaboration log). Product content (spec/doc/design) lives in
the git repo; baton stores references only — **pull, not push**: given a reference, go read the
real file in the worktree instead of waiting for someone to paste the full text.

## Context (read first)

- `.baton.json` in cwd holds server / project / worker — write commands **bare**; no
  `--project` / `--url` needed (baton injects the file when provisioning the worktree).
- Worker attribution: `jq .worker.id .baton.json` for your own worker id; pass `--worker <id>` when commenting.
- Fallback: if `.baton.json` is missing, use `--project $BATON_PROJECT_ID --url $BATON_URL`.
- Add `--json` whenever output needs parsing.

## Model & state machines

```
Project ─► Requirement (R-N)   status: active → done | cancelled   (product dimension; humans advance it)
              ├─ resources: [{kind: doc|link|file, uri, label}]    (references into git — go read the repo)
              └─► Task (T-N)   status: todo → in_progress → done | failed | cancelled
                     ├─ dependsOn: prerequisite tasks (unfinished dep = blocked; do ready ones first)
                     └─► Comment (append-only; text + git references, never file contents)
```

## Command surface

| command | purpose |
|---|---|
| `baton requirement create <title> [--desc D] [--body MD]` | create a requirement, returns R-N |
| `baton requirement ls` / `get R-N` / `rm R-N` | list / detail / delete |
| `baton requirement set-status R-N <active\|done\|cancelled>` | advance requirement status |
| `baton task create <title> --requirement R-N [--body MD] [--deps T-a,T-b]` | create a task, returns T-N |
| `baton task ls --requirement R-N` / `get T-N` / `rm T-N` | list / detail / delete |
| `baton task set-status T-N <todo\|in_progress\|done\|failed\|cancelled>` | advance task status |
| `baton task comment add T-N <body> --worker <id>` | report (append-only; sign it) |
| `baton task comment ls T-N` | read the collaboration log in order |

## Flows

```clojure
(defn pick-up [T-N]
  (-> (baton task get T-N --json)              ; title/body = the short brief
      (baton task comment ls T-N --json)       ; cold-start memory: read what predecessors/you left behind
      (baton requirement get R-N --json)       ; background + resources
      (read-real-spec :from worktree :via resources) ; references point into git → read the files
      (baton task set-status T-N in_progress)
      (implement)                              ; write code / change files / commit on the current worktree branch
      (baton task comment add T-N result --worker id) ; conclusion + file/commit/branch references
      (baton task set-status T-N (if success done failed))))

(defn plan-and-decompose [requirement]
  (-> (baton requirement create title --desc one-liner --body detailed-md)
      (doseq [t subtasks]                      ; granularity: "one session can finish it in one sitting"
        (baton task create (:title t) --requirement R-N
               --body (:spec t) --deps (:deps t)))
      (reply "R-N split into T-x..T-y, dependencies ...")))

(defn report-progress [T-N]                    ; mid-flight on long tasks, or when asked "how is it going"
  (baton task comment add T-N "done so far… / stuck on… / next…" --worker id))
```

## Discipline

- **A result comment must precede done/failed**: what was done, which branch/commit, how it was verified.
- Comments carry conclusions + references (file paths, commits, T-N), not big spec or diff dumps.
- Failures go through `failed` + a comment explaining why — no silence, no pretending it worked.
- Don't reach for `rm` commands unless a human explicitly asks for deletion.
- Requirement status is advanced mainly by humans; when all tasks are done, remind via a comment
  instead of closing R-N yourself.
