---
name: github-sync
description: >-
  Light sync bridge between GitHub issues and baton — mirrors repo issues into
  baton Requirements as "number + title + status + link" only; content is never
  copied, read it live via gh. Also owns the unified create-work-item flow
  (decides GitHub vs local-only so agents never pick a side), publishing R/T to
  GitHub, and mirroring blocked/help-needed onto the issue (baton:* labels).
  Use when asked to "sync github issues", "create a work item / 建个任务需求",
  "record this for later / 记下来下周做", "send R-N to GitHub", "把求助挂到
  issue 上", or to check whether issues and requirements line up.
---

# github-sync

Division of labor — don't cross it:

- **GitHub issues (via gh)** — source of truth for the product dimension: body, discussion, open/closed state all live here (raw issue operations: sibling skill `github-issues`)
- **baton** — the R/T collaboration dimension + session/worker orchestration
- **github-sync (this skill)** — the light bridge in between, maintaining "number + title + status + link" only

## Prerequisites

- cwd is inside the target git repo: `gh` picks up the origin repo and local auth automatically — **zero config**.
- baton commands work bare (`.baton.json` carries server/project); same fallback as the baton skill.

## Light-sync boundary (what NOT to do, first)

- **Never copy the body**: issue content lives on GitHub; read it live with `gh issue view <n> --comments`.
  The baton-side body holds a single line — the issue link.
- **Never copy comments**: discussion stays on the issue.
- **What DOES sync** (GitHub wins, pull direction only): title, status, url.
  Status map — `open → active`, `closed/completed → done`, `closed/not_planned → cancelled`.
  Linked tasks: closed maps the same way; open **keeps the local todo/in_progress/blocked
  granularity** (an open issue can't distinguish them — never downgrade).
- Consequence: for a linked row, GitHub owns the open/closed outcome — advance it with
  `gh issue close`/`reopen`, never `set-status done/cancelled/active` by hand (it gets pulled
  back next sync). The open-state granularity on tasks (todo/in_progress/blocked) is local
  and yours to set.

## Labels (baton: namespace — the bridge's only marks on GitHub)

| label | set when | meaning |
|---|---|---|
| `baton:requirement` | publishing a Requirement | this issue mirrors a baton Requirement |
| `baton:task` | publishing a Task | mirrors a baton Task — **sync skips it** (must not double-mirror as a Requirement) |
| `baton:blocked` | a linked item goes blocked | the baton side is waiting on a human; removed on resume |
| `baton:needs-verification` | `item.mjs close` succeeds | machine verify passed, closed, awaiting the creator's in-person acceptance |

Unlabeled issues still mirror as Requirements by default (zero-setup repos keep working).
Create labels lazily and idempotently the first time one is needed:

```bash
gh label create "baton:requirement"        --color 5319e7 2>/dev/null || true
gh label create "baton:task"               --color 5319e7 2>/dev/null || true
gh label create "baton:blocked"            --color d93f0b 2>/dev/null || true
gh label create "baton:needs-verification" --color 1d76db 2>/dev/null || true
```

### Acceptance (two stages: machine verify, then a human)

`item.mjs close` (baton skill) closes the issue only after the Verification block
passes, then labels it `baton:needs-verification` and cc's the creator. The creator:
- satisfied → `gh issue edit <n> --remove-label baton:needs-verification` (accepted, fully done)
- not satisfied → `gh issue reopen <n>` + a comment why — sync pulls the row back to active

## Flows

```clojure
(defn sync []                                     ; "sync github issues"
  (let [issues (gh issue list --state all --limit 200   ; all: closed ones drive status sync
                  --json number,title,url,state,stateReason,labels)
        reqs   (baton requirement ls --json)]     ; external.number = reconciliation key
    (doseq [i issues]
      (if-let [r (find-by #(= (-> % :external :number) (:number i)) reqs)]
        (do
          (when (not= (:title r) (:title i))      ; linked: follow title
            (baton requirement update (:code r) --title (:title i)))
          (when (not= (:status r) (status<-issue i)) ; ... and status (GitHub wins)
            (baton requirement set-status (:code r) (status<-issue i)))
          (when (not= (-> r :external :url) (:url i)) ; ... and url (repo rename/transfer)
            (baton requirement link (:code r) (:url i))))
        (when (and (= (:state i) "OPEN")
                   (not (has-label? i "baton:task"))) ; task mirrors belong to their Task, never a new R
          (baton requirement create (:title i)
                 --github (:url i)
                 --body   (:url i)))))            ; body holds the link, nothing else
    (doseq [r (filter :external reqs)]            ; orphan check: linked row, issue gone
      (when (not (find-by #(= (:number %) (-> r :external :number)) issues))
        (remind-human "R-N links issue #n which no longer exists (deleted/transferred) — unlink or relink?")))
    (report "created R-x..R-y / title n / status m / orphans (above)")))

(def status<-issue                                ; GitHub state → Requirement status
  {"OPEN" "active", ["CLOSED" "COMPLETED"] "done", ["CLOSED" "NOT_PLANNED"] "cancelled"})

(defn work-on [R-N]                               ; picked up a requirement that has external
  (-> (baton requirement get R-N --json)          ; :external :number → n
      (gh issue view n --comments)                ; live-read body + discussion, never copy
      (implement :per baton-skill pick-up flow)
      (gh issue comment n --body progress)        ; progress goes back to the issue
      (when done
        (item.mjs close R-N)                      ; the gate: lint → verify → close + needs-verification + cc
        (sync))))                                 ; baton catches up through the one sync path

(defn publish [R-N]                               ; reverse direction, ONLY on explicit request
  (-> (ensure-labels)                             ; lazy idempotent label init (see Labels)
      (gh issue create --title (:title r) --body (:body r) --label "baton:requirement")
      (baton requirement link R-N issue-url)
      (item.mjs lint R-N)))                       ; published body must be spec-compliant

(defn publish-task [T-N]                          ; task wants GitHub visibility (help, hand-off)
  (-> (ensure-labels)
      (gh issue create --title (:title t) --body (:body t) --label "baton:task")
      (baton task link T-N issue-url)             ; baton:task keeps sync from re-mirroring it as an R
      (item.mjs lint T-N)))

(defn create-work-item [title spec-body]          ; UNIFIED CREATE — agents never pick a side themselves
  ;; any size counts: a one-line bug is a valid work item (body = Goal/Verification/Refs)
  (if (and (git remote get-url origin :is-github?)
           (gh auth status :ok?))
    (-> (gh issue create --title title --body-file f --label "baton:requirement")
        (baton requirement create title --github url --body url) ; both sides, linked, one step
        (item.mjs lint issue-url))                ; born valid or fixed on the spot
    (-> (baton requirement create title --body spec-body) ; no GitHub in play → local-only
        (item.mjs lint R-N))))

(defn block-mirror [T-N question human?]          ; linked item went blocked (see baton skill `stuck`)
  (-> (gh issue comment n --body question)        ; the ask, with full context, on the issue
      (gh issue edit n --add-label "baton:blocked")
      (when human? (gh issue edit n --add-assignee human?)))) ; pull a specific person in

(defn unblock-mirror [T-N]                        ; resumed (see baton skill `resume`)
  (gh issue edit n --remove-label "baton:blocked"))
```

## Command surface (everything this skill uses)

| command | purpose |
|---|---|
| `gh issue list --state all --limit 200 --json number,title,url,state,stateReason,labels` | pull the issue list (all states; default limit is 30 — always raise it) |
| `gh issue view <n> --comments` | live-read body + discussion (mandatory before working) |
| `gh issue comment <n> --body "..."` | progress / conclusions back to the issue |
| `gh issue close <n> --comment "..."` | close when done (conclusion comment first) |
| `gh issue edit <n> --add-label/--remove-label baton:blocked [--add-assignee <u>]` | block / unblock mirror |
| `gh label create "baton:<x>" --color <c> \|\| true` | lazy idempotent label init |
| `baton requirement create <title> --github <url> --body <url>` | create the minimal mirror |
| `baton requirement update R-N --title <t>` | re-sync rename |
| `baton requirement link R-N <url>` / `baton task link T-N <url>` | attach a link to an existing R/T |
| `baton requirement unlink R-N` / `baton task unlink T-N` | clear a mistaken association |

## Discipline

- The reconciliation key is `external.number`; never guess associations by title.
- One issue maps to at most one Requirement (a DB unique constraint backstops this; hitting it means the logic is wrong).
- For linked rows, the open/closed outcome lives on GitHub: advance it with `gh issue close` / `reopen`, then run `sync` — never hand-set `done/cancelled/active` on a linked row (one write path, no dual-write drift). Open-state granularity (todo/in_progress/blocked) is local. Titles — edit on GitHub.
- Tasks decompose freely on the baton side, no forced GitHub counterpart; when one is wanted (help, hand-off, visibility), `publish-task` (with `baton:task`) or `baton task link`.
- New work items go through `create-work-item` — the flow decides GitHub vs local-only; agents don't pick a side. Publishing *existing* rows stays explicit only ("send R-N to GitHub"); sync never auto-publishes.
- A close needs its conclusion comment first (what was done, which branch/commit); never close someone else's issue on your own.
- An orphaned link (issue deleted/transferred) is reported, never auto-deleted; the human picks `unlink` or `link <new-url>`.
- Sync is idempotent: running twice yields the same result; when unsure, run it again instead of patching by hand.
- When showing issues to a human, lead with the clickable URL (`#N title` + link); don't dump bodies into the terminal — expand only when asked to analyze.
