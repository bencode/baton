---
name: github-issues
description: >-
  Operate GitHub issues from the current repo via the gh CLI — list what's
  open, see who's working on what, view an issue with its discussion, create
  or edit issues, comment progress, claim or hand off, close (completed /
  not planned) and reopen. Use when asked "看看有哪些 issue / what's open",
  "我的盘子 / what's on my plate", "看下 #12 / show me issue 12", "评论一下 /
  comment on it", "建个 issue / file an issue", "这个不做了 / cancel it",
  "关掉 #12 / close it", "认领 / take this", "转给 X / hand it to X", or any
  direct issue operation. Mirroring issues into baton R/T is the sibling
  skill github-sync; this one is the raw issue toolbox.
---

# github-issues

GitHub issues are the source of truth for product discussion; this skill is the
toolbox for operating them directly. Everything goes through `gh` in the repo
cwd — origin repo and local auth are picked up automatically, **zero config**.
No lifecycle labels, no bots: native semantics carry the state — assignee =
claimed and being worked, closed + state_reason = outcome, comments = progress.

## Output style (default behavior)

When showing issues to a human, lead with the clickable URL; don't dump bodies
into the terminal:

```
#12  Support unlinking the external ref  [open]  @bencode
     https://github.com/<owner>/<repo>/issues/12
```

Expand the body/discussion only when asked to analyze, summarize, or when you
are about to start working on it.

## Command surface

| group | command | purpose |
|---|---|---|
| inventory | `gh issue list --state open --limit 200 --json number,title,url,assignees` | what's open (default page is 30 — always raise it) |
| inventory | `gh issue list --assignee @me --state open` | my plate |
| inventory | `gh issue list --assignee <user>` / `--label <x>` | who's on what / by label |
| inventory | `gh issue list --state closed --search "closed:>2026-06-01 keyword"` | recently closed / keyword search |
| inspect | `gh issue view <n> --comments` | full context: body + discussion (read before working) |
| inspect | `gh issue view <n> --json number,title,body,state,stateReason,assignees,labels,comments,url` | structured (for reconciliation/scripts) |
| create | `gh issue create --title "..." --body-file /tmp/body.md [--assignee <u>] [--label <x>]` | file an issue (body via file — no shell-escaping accidents) |
| edit | `gh issue edit <n> --title/--body/--add-label/--remove-label` | adjust fields |
| communicate | `gh issue comment <n> --body "..."` | progress / conclusions / questions (`#N` cross-links, `@user` mentions) |
| lifecycle | `gh issue close <n> --comment "..."` | done (state_reason: completed) |
| lifecycle | `gh issue close <n> --reason "not planned" --comment "..."` | cancelled / won't do (also: `--reason duplicate`) |
| lifecycle | `gh issue reopen <n>` | not actually done — reopen, then comment why |
| ownership | `gh issue edit <n> --add-assignee @me` | claim before starting work |
| ownership | `gh issue edit <n> --remove-assignee <old> --add-assignee <new>` | hand off (+ a hand-over comment) |

## Flows

```clojure
(defn inventory []                                ; "what's open?" / "my plate?"
  (-> (gh issue list --state open --limit 200 --json number,title,url,assignees)
      (render :url-first)))                       ; numbers + links + owners, no bodies

(defn inspect [n]                                 ; "看下 #12" / before working
  (gh issue view n --comments))                   ; live-read; never paste whole bodies back

(defn file-issue [title body]                     ; "建个 issue"
  (-> (confirm-with-human title body)             ; outward-facing: confirm wording first
      (write-file "/tmp/issue-body.md" body)
      (gh issue create --title title --body-file "/tmp/issue-body.md")
      (reply url)))                               ; lead with the link

(defn claim [n]                                   ; before starting work — visible ownership
  (gh issue edit n --add-assignee "@me"))

(defn report [n conclusion]                       ; progress or findings, any time
  (gh issue comment n --body conclusion))         ; conclusion + refs (commit/branch/files)

(defn finish [n conclusion]                       ; only after the human confirms done
  (gh issue close n --comment conclusion))        ; conclusion comment is mandatory

(defn cancel [n reason]                           ; "这个不做了" — never close silently
  (gh issue close n --reason "not planned" --comment reason))

(defn not-done [n reason]                         ; acceptance failed
  (-> (gh issue reopen n)
      (gh issue comment n --body reason)))

(defn hand-off [n from to context]                ; transfer ownership with a baton pass
  (-> (gh issue edit n --remove-assignee from --add-assignee to)
      (gh issue comment n --body context)))       ; where it stands, what's left, gotchas
```

## Discipline

- Read before acting: `gh issue view <n> --comments` is mandatory before working on or
  commenting about an issue.
- Claim before working (`--add-assignee @me`) so others can see who's on it; hand off with
  a context comment, never by silently swapping assignees.
- A close carries its conclusion (what was done, which branch/commit, how it was verified);
  cancellations use `--reason "not planned"` + why — never close silently, never close an
  issue you didn't create without the creator's go-ahead.
- Comments carry conclusions + references, not big spec or diff dumps.
- Creating an issue is outward-facing: confirm title/body wording with the human first.
- If the repo has its own issue conventions (lifecycle labels, automation bots, required
  body sections), follow them — this skill defines defaults, not overrides.
- Labels in the `baton:*` namespace belong to the github-sync bridge (mirror markers,
  blocked signal); don't add or remove them from here.
- Issues linked to baton R/T: title/status flow through the github-sync skill's sync pass;
  don't hand-edit the baton side.

## Appendix: sub-issues (optional)

Decomposition normally lives on the baton side (tasks, free-form). When a human explicitly
wants GitHub-side hierarchy, the sub-issues API is reachable via `gh api` (no native gh
subcommand yet); note it takes the child's numeric **id**, not its #number:

```bash
gh api repos/{owner}/{repo}/issues/{n}/sub_issues                        # list children
gh api -X POST repos/{owner}/{repo}/issues/{n}/sub_issues \
  -F sub_issue_id="$(gh api repos/{owner}/{repo}/issues/<child-n> --jq .id)"  # attach a child
# careful: the numeric REST id (gh api ... --jq .id), NOT the #number, and not
# the GraphQL node id that `gh issue view --json id` returns
```
