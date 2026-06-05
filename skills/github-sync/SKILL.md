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

- **GitHub issues (via gh)** — source of truth for the product dimension: body, discussion, open/closed state all live here
- **baton** — the R/T collaboration dimension + session/worker orchestration
- **github-sync (this skill)** — the light bridge in between, maintaining "number + title + link" only

## Prerequisites

- cwd is inside the target git repo: `gh` picks up the origin repo and local auth automatically — **zero config**.
- baton commands work bare (`.baton.json` carries server/project); same fallback as the baton skill.

## Light-sync boundary (what NOT to do, first)

- **Never copy the body**: issue content lives on GitHub; read it live with `gh issue view <n> --comments`.
  The baton-side body holds a single line — the issue link.
- **Never copy comments, never touch status**: the sync pass changes no status on either side;
  Requirement status is advanced by humans (baton skill discipline).
- **Update title only**: on re-sync, if the issue title changed, rename the baton side; touch nothing else.

## Flows

```clojure
(defn sync []                                     ; "sync github issues"
  (let [issues (gh issue list --state open --json number,title,url)
        reqs   (baton requirement ls --json)]     ; external.number = reconciliation key
    (doseq [i issues]
      (if-let [r (find-by #(= (-> % :external :number) (:number i)) reqs)]
        (when (not= (:title r) (:title i))        ; linked: title-only update
          (baton requirement update (:code r) --title (:title i)))
        (baton requirement create (:title i)      ; new issue: minimal mirror
               --github (:url i)
               --body   (:url i))))               ; body holds the link, nothing else
    (report "created R-x..R-y / renamed n / drift reminders (below)")))

(defn work-on [R-N]                               ; picked up a requirement that has external
  (-> (baton requirement get R-N --json)          ; :external :number → n
      (gh issue view n --comments)                ; live-read body + discussion, never copy
      (implement :per baton-skill pick-up flow)
      (gh issue comment n --body conclusion)      ; progress/conclusion goes back to the issue
      (when human-confirmed-done
        (gh issue close n --comment "...")        ; closing requires a conclusion comment
        (baton requirement set-status R-N done))))

(defn drift-check []                              ; do this during sync, in passing
  (doseq [r (filter :external reqs)]
    (when (and (issue-closed? r) (= (:status r) "active"))
      (remind-human "issue #n is closed but R-N is still active — advance it?")))) ; never change it yourself
```

## Command surface (everything this skill uses)

| command | purpose |
|---|---|
| `gh issue list --state open --json number,title,url` | pull the issue list |
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
- Tasks decompose freely on the baton side, no forced GitHub counterpart; when one is wanted (e.g. a sub-issue), use `baton task link`.
- A close needs its conclusion comment first (what was done, which branch/commit); never close someone else's issue on your own.
- Sync is idempotent: running twice yields the same result; when unsure, run it again instead of patching by hand.
- When showing issues to a human, lead with the clickable URL (`#N title` + link); don't dump bodies into the terminal — expand only when asked to analyze.
