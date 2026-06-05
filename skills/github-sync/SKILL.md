---
name: github-sync
description: >-
  Light sync bridge between GitHub issues and baton — mirrors repo issues into
  baton Requirements as "number + title + link" only; content is never copied,
  read it live via gh. Issue progression (comment/close) also goes through gh.
  Use when asked to "sync github issues", "mirror issues into baton", or to
  check whether issues and requirements line up.
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
  Linked tasks: closed maps the same way; open **keeps the local todo/in_progress granularity**
  (an open issue can't distinguish them — never downgrade).
- Consequence: for a linked row, advance status **on GitHub** (`gh issue close`), not in baton —
  a baton-only `set-status done` on a still-open issue gets pulled back to `active` next sync.

## Flows

```clojure
(defn sync []                                     ; "sync github issues"
  (let [issues (gh issue list --state all --limit 200   ; all: closed ones drive status sync
                  --json number,title,url,state,stateReason)
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
        (when (= (:state i) "OPEN")               ; new issue: minimal mirror (skip dead ones)
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
      (gh issue comment n --body conclusion)      ; progress/conclusion goes back to the issue
      (when human-confirmed-done
        (gh issue close n --comment "...")        ; closing requires a conclusion comment
        (sync))))                                 ; baton catches up through the one sync path — never hand-set status on linked rows

(defn publish [R-N]                               ; reverse direction, ONLY on explicit request
  (-> (gh issue create --title (:title r) --body (:body r)) ; "send R-N to GitHub"
      (baton requirement link R-N issue-url)))
```

## Command surface (everything this skill uses)

| command | purpose |
|---|---|
| `gh issue list --state all --limit 200 --json number,title,url,state,stateReason` | pull the issue list (all states; default limit is 30 — always raise it) |
| `gh issue view <n> --comments` | live-read body + discussion (mandatory before working) |
| `gh issue comment <n> --body "..."` | progress / conclusions back to the issue |
| `gh issue close <n> --comment "..."` | close when done (conclusion comment first) |
| `baton requirement create <title> --github <url> --body <url>` | create the minimal mirror |
| `baton requirement update R-N --title <t>` | re-sync rename |
| `baton requirement link R-N <url>` / `baton task link T-N <url>` | attach a link to an existing R/T |
| `baton requirement unlink R-N` / `baton task unlink T-N` | clear a mistaken association |

## Discipline

- The reconciliation key is `external.number`; never guess associations by title.
- One issue maps to at most one Requirement (a DB unique constraint backstops this; hitting it means the logic is wrong).
- For linked rows, status lives on GitHub: advance it with `gh issue close` / `reopen`, then run `sync` — **never `baton set-status` a linked row by hand** (one write path, no dual-write drift). Same for titles — edit on GitHub.
- Tasks decompose freely on the baton side, no forced GitHub counterpart; when one is wanted (e.g. a sub-issue), use `baton task link`.
- baton → GitHub creation is **explicit only** ("send R-N to GitHub"); sync never auto-publishes local rows.
- A close needs its conclusion comment first (what was done, which branch/commit); never close someone else's issue on your own.
- An orphaned link (issue deleted/transferred) is reported, never auto-deleted; the human picks `unlink` or `link <new-url>`.
- Sync is idempotent: running twice yields the same result; when unsure, run it again instead of patching by hand.
- When showing issues to a human, lead with the clickable URL (`#N title` + link); don't dump bodies into the terminal — expand only when asked to analyze.
