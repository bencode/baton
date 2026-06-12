---
name: dispatch
description: >
  Triage the GitHub issue queue and fan it out to baton sessions — pull open
  issues with a queue label (default dispatch:queue), propose a grouping plan,
  get the user's confirmation, then create one session per group with a
  self-contained brief and mark the issues as taken. Use when the user says
  "/dispatch", "安排任务", "派单", "把队列里的 issue 派一下", "拉 issue
  安排一下", or asks to plan/distribute the pending GitHub issues.
---

# dispatch — triage the issue queue, fan out sessions

You are the dispatcher, not the executor. One run = pull → plan → **confirm
with the user** → create sessions → mark issues → report links → done. You
never fix the issues yourself, and you never wait for the spawned sessions to
finish. Everything goes through `gh` (current repo) and the `baton` CLI (both
on PATH; baton auth comes from the cwd `.baton.json`).

## Flow

```clojure
(defn dispatch [msg]                ; "/dispatch [label] [extra instructions]"
  ;; 1. parse — label defaults to the queue; free text may pin a worker
  ;;    ("/dispatch bug 都给 W-9" → label=bug, default-worker=W-9)
  (def label (or (:label msg) "dispatch:queue"))

  ;; 2. pull the queue from THIS session's repo
  (def issues (gh issue list --label label --state open --limit 100
                 --json number,title,body,url,labels,assignees))

  ;; 3. drop issues already in flight — any state:* label means a previous
  ;;    dispatch (or the relay flow) owns it. Empty queue → say so, stop.
  (def pending (remove #(some (fn [l] (str/starts-with? l "state:")) (:labels %)) issues))
  (when (empty? pending) (reply "queue is empty — nothing to dispatch") (stop))

  ;; 4. plan — read title+body, group by affinity: small same-module/same-kind
  ;;    issues merge into one group; a big task stands alone. Per group:
  ;;    session-name slug, issues, target worker (default: THIS worker),
  ;;    one-line approach.
  (def plan (group-by-affinity pending))

  ;; 5. CONFIRM GATE (hard rule): present the plan as a table
  ;;    (group | issues | worker | approach) and STOP — end the turn, wait
  ;;    for the user. They may merge/split/drop groups or retarget workers.
  ;;    Never dispatch without an explicit go-ahead.
  (reply (render-plan plan) "confirm and I dispatch; ask for any adjustment")

  ;; ===== next turn, after the user confirms (possibly with edits) =====

  ;; 6. dispatch each group — one failure must not block the others
  (doseq [g plan]
    ;; same worker: omit --worker; other worker: the delegate skill's flow
    (def s (baton session create "<g.slug>" [--worker W-<n>] --json))
    ;; wait for attached — the server 409s messages until the child
    ;; subscribes; cold spawn takes ~10-30s, give up after ~60s:
    ;;   until baton session get <s.id> --project <s.projectId> --json \
    ;;         | grep -q '"attached": true'; do sleep 5; done
    (baton session send <s.id> "<brief>" --project <s.projectId>)
    ;; mark each issue taken: lifecycle label + traceable link
    (doseq [i (:issues g)]
      (gh issue edit (:number i) --add-label "state:in-progress")
      (gh issue comment (:number i)
        --body (str "dispatched → https://baton.fmap.dev/s/" (:shareToken s)))))

  ;; 7. report — one line per group (name, issues, session share link);
  ;;    failed groups listed separately with the reason. Then end the turn.
  (reply (render-report plan)))
```

## Commands (exact — don't guess variants)

```bash
gh issue list --label "<label>" --state open --limit 100 \
  --json number,title,body,url,labels,assignees
baton worker ls --project <pid> --json        # `ls`, not `list`
baton session create "<slug>" [--worker W-N] --json
baton session get <id> --project <pid> --json # poll .attached
baton session send <id> "<brief>" --project <pid>
gh issue edit <n> --add-label "state:in-progress"
gh issue comment <n> --body "dispatched → <share-link>"
```

## The brief

The target session cold-starts with zero context — the brief is everything it
gets (delegate skill's iron rule). Include, per group:

- goal: what done looks like for this group, in one paragraph
- per issue: `#N` / title / URL / the body's key points (don't make the
  target re-derive them)
- constraints the user stated during confirmation
- acceptance: work the issues per the github-issues skill — `state:in-progress`
  while working, close via its two-step verification flow
  (close → `state:needs-verification` → creator marks `state:verified`)

## Discipline

- **Never skip the confirm gate.** Plan and dispatch are separate turns; an
  unconfirmed plan is just a proposal.
- **Don't execute the issues yourself** — even a "trivial" one gets a session.
  Dispatcher and executor stay separate so the queue drains predictably.
- **Idempotent by labels**: anything carrying `state:*` is already owned —
  re-running /dispatch must not double-assign. The comment with the session
  link is the audit trail.
- **Fire-and-forget**: after sending briefs, reply with links and end. Progress
  questions later → `baton session get` (the `busy` field), or the issue's
  state labels.
- **Offline workers don't take jobs**: a session on an `alive: false` worker
  never attaches — surface it and let the user retarget, don't pretend.
- One-time setup if the queue label is missing:
  `gh label create dispatch:queue --color 5319e7 --description "queued for /dispatch"`.
- Boundaries: GitHub issues are the source and the state machine
  (github-issues skill owns execution-side conventions); baton R/T records
  (baton skill) are a separate track — don't create R/T rows here.
