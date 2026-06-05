---
name: baton
description: >-
  baton collaboration — pick up work (handle T-N / implement R-N), create and
  decompose Requirements/Tasks, report progress via comments, advance the state
  machines. Use when asked to "handle T-3", "implement R-2", "split this
  requirement into tasks", "report progress", "what tasks are there",
  "create/record a task for me" (建个任务 / 记个任务 / 帮我记下来下次做 /
  下次继续 / don't lose this across sessions), or whenever collaboration
  records need creating/updating on baton. When a HUMAN asks to create or
  record a task to be remembered or picked up later, that is ALWAYS a baton
  Task (durable, shared, survives sessions) — never the session-local todo
  tools (TaskCreate etc.), which evaporate with the session.
---

# baton collaboration

baton is the single source of truth for the collaboration dimension: Requirement (product intent)
→ Task (execution unit) → Comment (collaboration log). Product content (spec/doc/design) lives in
the git repo; baton stores references only — **pull, not push**: given a reference, go read the
real file in the worktree instead of waiting for someone to paste the full text. baton is also the
**cross-session memory**: "remember this for later / next week" requests land here, because the
next session (or another worker, or a human) finds them — nothing session-local does that.

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
                     │                          ▲    │
                     │                          └────┘ blocked (waiting on a human; answer → back to in_progress)
                     ├─ dependsOn: prerequisite tasks (unmet dep = derived dep-blocked; do ready ones first)
                     └─► Comment (append-only; text + git references, never file contents)
```

## What kind to create

- **A new problem / bug / idea / need = a Requirement** — any size; a one-line bug is a valid
  work item (in a GitHub repo, github-sync's `create-work-item` makes it an issue + linked
  mirror in one step). If one sitting finishes it, don't decompose at all.
- **Tasks exist only as decomposition** of a Requirement (`plan-and-decompose`).
- **A task with no natural parent** goes under the project's standing **`Inbox`** Requirement:
  find it by exact title `Inbox`; if missing, create it once
  (`baton requirement create Inbox --body "Standing inbox for stray tasks; stays active."`).
  Inbox stays `active` forever and never goes through acceptance; humans review it
  periodically — re-parent tasks that grew up, finish the rest in place.

## Work-item spec (every R / T / issue body)

Every work item entering the loop carries three sections — the Verification
block is the **formal definition of done** (a sensor, not prose). Status can't
turn without it: agents never self-report completion.

```markdown
## Goal

Quantified outcome — "after this, the system has state X". Not "improve X".

## Verification

​```bash
test -f src/lib/validate.ts
pnpm test src/lib/validate.test.ts --silent
​```

## Refs

- doc: docs/xxx.md / file paths / #N / R-N
```

Rules: the ```bash block sits **immediately after** the `## Verification`
heading (blank lines only — strict position keeps extraction deterministic);
exactly one block; executable, repeatable commands only — never `# manual: ...`.

The sensor tool (bundled with this skill; ref = `#N` / issue url / `R-N` / `T-N`,
linked rows follow their issue link for the body):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/item.mjs" lint   <ref>  # structure gate
node "${CLAUDE_SKILL_DIR}/scripts/item.mjs" verify <ref>  # run the bash block ("is it done?")
node "${CLAUDE_SKILL_DIR}/scripts/item.mjs" close  <ref>  # lint → verify → close/done + report
```

`close` is the ONLY exit to done: issues get closed (completed) with the verify
output + `baton:needs-verification` + cc to the creator; local rows get a result
comment + `set-status done`. Any failing step refuses the close.

## Command surface

| command | purpose |
|---|---|
| `baton requirement create <title> [--desc D] [--body MD]` | create a requirement, returns R-N |
| `baton requirement ls` / `get R-N` / `rm R-N` | list / detail / delete |
| `baton requirement set-status R-N <active\|done\|cancelled>` | advance requirement status |
| `baton task create <title> --requirement R-N [--body MD] [--deps T-a,T-b]` | create a task, returns T-N |
| `baton task ls --requirement R-N` / `get T-N` / `rm T-N` | list / detail / delete |
| `baton task set-status T-N <todo\|in_progress\|blocked\|done\|failed\|cancelled>` | advance task status |
| `baton task comment add T-N <body> --worker <id>` | report (append-only; sign it) |
| `baton task comment ls T-N` | read the collaboration log in order |

## Flows

```clojure
(defn pick-up [T-N]
  (-> (item.mjs lint T-N)                      ; gate first: malformed brief → stuck/clarify, never guess
      (baton task get T-N --json)              ; title/body = the spec (Goal/Verification/Refs)
      (baton task comment ls T-N --json)       ; cold-start memory: read what predecessors/you left behind
      (baton requirement get R-N --json)       ; background + resources
      (read-real-spec :from worktree :via resources) ; references point into git → read the files
      (baton task set-status T-N in_progress)
      (implement)                              ; write code / change files / commit on the current worktree branch
      (if success
        (item.mjs close T-N)                   ; the only exit to done: lint → verify → close + report
        (do (baton task comment add T-N why --worker id)
            (baton task set-status T-N failed)))))

(defn plan-and-decompose [requirement]
  (-> (baton requirement create title --desc one-liner --body spec-md) ; body = Goal/Verification/Refs
      (doseq [t subtasks]                      ; granularity: "one session can finish it in one sitting"
        (baton task create (:title t) --requirement R-N
               --body (:spec t) --deps (:deps t))) ; each task body is spec-compliant too
      (doseq [t created] (item.mjs lint t))    ; re-check what you just wrote
      (reply "R-N split into T-x..T-y, dependencies ...")))

(defn report-progress [T-N]                    ; mid-flight on long tasks, or when asked "how is it going"
  (baton task comment add T-N "done so far… / stuck on… / next…" --worker id))

(defn stuck [T-N]                              ; need a human: a decision, a credential, missing context
  (-> (baton task comment add T-N "blocked: <what's stuck> / need <who> to <answer what> / tried <...>" --worker id)
      (baton task set-status T-N blocked)
      (when (linked? T-N or its R-N)           ; GitHub-linked → mirror the ask (github-sync skill)
        (github-sync block-mirror))))          ; issue comment + baton:blocked label + optional assignee

(defn resume [T-N]                             ; the human answered (baton comment or issue reply)
  (-> (baton task set-status T-N in_progress)
      (when linked (github-sync unblock-mirror)) ; remove baton:blocked
      (continue)))
```

## Discipline

- **Don't invent a throwaway Requirement per stray task — use `Inbox`**; and don't dump real
  product work into Inbox either (it's an inbox, not a landfill — promote what grows).
- **Never satisfy "create/record a task" with the session todo list** (TaskCreate / TodoWrite):
  those are your private scratchpad — invisible to humans and other workers, gone next session.
  Human-requested tracking lives in baton (or its linked issue). Session todos are fine for
  organizing your own multi-step work; they just aren't the deliverable.
- **Never hand-set done — `item.mjs close` is the only exit**: it lints, runs the Verification
  block, and only a passing run closes/completes the item. Self-reported "done" is the failure
  mode this whole spec exists to prevent. (`failed` stays manual: comment why + set-status.)
- **A result comment must precede done/failed**: what was done, which branch/commit, how it was verified.
- **No bare blocked**: the comment must say what's stuck, who is needed, and what answer unblocks it — `blocked` without that is just silence with a different color.
- Comments carry conclusions + references (file paths, commits, T-N), not big spec or diff dumps.
- Failures go through `failed` + a comment explaining why — no silence, no pretending it worked.
- Don't reach for `rm` commands unless a human explicitly asks for deletion.
- Requirement status is advanced mainly by humans; when all tasks are done, remind via a comment
  instead of closing R-N yourself.
