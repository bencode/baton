---
name: github-issues
description: >-
  Operate GitHub issues from the current repo via the gh CLI — list what's
  open, see who's working on what, view an issue with its discussion, create
  or edit issues, comment progress, claim or hand off, and drive the labeled
  lifecycle (in-progress → needs-verification → verified) to close. Use when
  asked "看看有哪些 issue / what's open", "我的盘子 / what's on my plate",
  "看下 #12 / show me issue 12", "评论一下 / comment on it", "建个 issue /
  file an issue", "这个不做了 / cancel it", "关掉 #12 / close it", "认领 /
  take this", "转给 X / hand it to X", or any direct issue operation. The
  GitHub track is independent of baton Requirement/Task (the baton skill) —
  the two never cross-link.
---

# github-issues

GitHub Issues are the source of truth for the GitHub collaboration track. Single-step
actions go through `gh` (repo + auth auto-detected from the git remote, **zero config**);
the multi-step **lint → verify → close** gate goes through the bundled sensor
`item.mjs` (shared with the baton skill). This track follows the **relay convention**:
labels carry the lifecycle, and "done" is a machine-run Verification block, not a self-report.

## First-time setup (per repo)

Create the 7 labels once (idempotent; never overwrites existing ones):

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/init-labels.sh"
```

## Output style (default behavior)

When showing issues to a human, lead with the clickable URL; don't dump bodies:

```
#42  Extract shared validation helper  [state:in-progress]  @bencode
     https://github.com/<owner>/<repo>/issues/42
```

Expand the body/discussion only when asked to analyze, summarize, compare, or when you
are about to start working on it.

## Required issue body (3 sections)

Every issue body carries the same spec the baton track uses — the Verification block is
the **formal definition of done** (a sensor, not prose). `item.mjs lint` enforces it; an
issue that fails lint cannot be closed.

```markdown
## Goal

Quantified outcome — "after this, the system has state X". Not "improve X".

## Verification

​```bash
test -f src/lib/validate.ts
pnpm test src/lib/validate.test.ts --silent
​```

## Refs

- doc: docs/xxx.md / file paths / #N
```

Rules: the ```bash block sits **immediately after** the `## Verification` heading (blank
lines only — strict position keeps extraction deterministic); exactly one block;
executable, repeatable commands only — never `# manual: ...`.

## Labels (the contract — names matter, descriptions are cosmetic)

| label | meaning | added / removed by |
|---|---|---|
| `actor:claude-code` / `actor:helm-agent` / `actor:scheduled` | who is meant to execute (a label, not an assignee) | whoever routes it |
| `state:in-progress` | assignee is working | assignee adds; `item.mjs close` removes it |
| `state:needs-clarification` | waiting on the creator for info | assignee adds / removes |
| `state:needs-verification` | closed, awaiting the creator's in-person acceptance | `item.mjs close` adds it; creator removes on accept |
| `state:verified` | creator has personally verified | creator adds when satisfied |

- **assignee** = the GitHub user primarily responsible (a real handle, 0-N). Nickname
  call-outs go in the body, never as the assignee.
- Issues are decoupled from git branches — never switch branches because a label changed.

## State semantics

| open/closed | label | meaning |
|---|---|---|
| open | none | assigned, not started |
| open | `state:in-progress` | assignee working |
| open | `state:needs-clarification` | waiting on creator |
| closed | `state:needs-verification` | awaiting creator acceptance |
| closed | `state:verified` | verified, fully done |
| closed | no lifecycle label | anomaly (process incomplete / legacy) |

## The sensor (lint / verify / close)

`item.mjs` lives in the sibling baton skill; ref = `#N` / issue url.

```bash
S="${CLAUDE_SKILL_DIR}/../baton/scripts/item.mjs"
node "$S" lint   <#N>   # structure gate
node "$S" verify <#N>   # run the Verification block ("is it done?") without closing
node "$S" close  <#N>   # lint → verify → close (completed) + state:needs-verification + cc creator
```

`close` is the ONLY way to close a structured issue: it lints, runs the Verification block
(`set -e`), and only a passing run closes it — removing `state:in-progress`, adding
`state:needs-verification`, and cc'ing the creator. Any failing step refuses the close.
Never bare `gh issue close` a structured issue (that bypasses verify = self-reporting done);
a `--reason "not planned"` cancellation is the exception (no verify gate — see flows).

## Command surface (single-step gh)

| group | command |
|---|---|
| inventory | `gh issue list --state open --limit 200 --json number,title,url,assignees,labels` |
| my plate | `gh issue list --assignee @me --state open` |
| by actor | `gh issue list --label actor:claude-code --state open` |
| awaiting my accept | `gh issue list --author @me --state closed --label state:needs-verification` |
| inspect | `gh issue view <n> --comments` (read before working) |
| create | `gh issue create --title "..." --body-file /tmp/body.md [--assignee <u>] [--label actor:claude-code]` |
| start | `gh issue edit <n> --add-label state:in-progress` |
| clarify | `gh issue comment <n> --body "..."` + `gh issue edit <n> --add-label state:needs-clarification` |
| comment | `gh issue comment <n> --body "..."` (`#N` cross-links, `@user` mentions) |
| cancel | `gh issue close <n> --reason "not planned" --comment why` |
| reopen | `gh issue reopen <n>` (then comment why) |
| claim / hand off | `gh issue edit <n> --add-assignee @me` / `--remove-assignee <old> --add-assignee <new>` |

## Flows

```clojure
(defn inventory []                                ; "what's open?" / "my plate?"
  (-> (gh issue list --state open --limit 200 --json number,title,url,assignees,labels)
      (render :url-first :group-by-state)))

(defn file-issue [title body]                     ; "建个 issue" — outward-facing
  (-> (confirm-with-human title body)             ; Goal/Verification/Refs; confirm wording first
      (write-file "/tmp/issue-body.md" body)
      (gh issue create --title title --body-file "/tmp/issue-body.md" --assignee who --label actor)
      (item.mjs lint <#N>)                         ; re-check structure
      (reply url)))

(defn start [n]                                   ; before working — visible ownership
  (-> (gh issue edit n --add-assignee "@me")
      (gh issue edit n --add-label state:in-progress)))

(defn clarify [n question]                        ; need info from the creator
  (-> (gh issue comment n --body question)
      (gh issue edit n --add-label state:needs-clarification)))  ; remove + re-add in-progress on answer

(defn finish [n]                                  ; the only close for a structured issue
  (item.mjs close n))                             ; lint → verify → close + needs-verification + cc creator

(defn accept [n]                                  ; creator, satisfied after in-person check
  (gh issue edit n --remove-label state:needs-verification --add-label state:verified))

(defn reject [n reason]                           ; creator, not satisfied
  (-> (gh issue reopen n)
      (gh issue edit n --remove-label state:needs-verification --add-label state:in-progress)
      (gh issue comment n --body reason)))

(defn cancel [n reason]                           ; "这个不做了" — no verify gate
  (gh issue close n --reason "not planned" --comment reason))

(defn hand-off [n from to context]
  (-> (gh issue edit n --remove-assignee from --add-assignee to)
      (gh issue comment n --body context)))       ; where it stands, what's left, gotchas
```

## Discipline

- Read before acting: `gh issue view <n> --comments` before working on or commenting about an issue.
- Claim + `state:in-progress` before working, so others see you're on it; hand off with a context comment.
- Close a structured issue only via `item.mjs close` (verify gate); cancellations use
  `--reason "not planned"` + why — never close silently, never close an issue you didn't create
  without the creator's go-ahead.
- Creator acceptance is a real step: `state:needs-verification` → (creator) `state:verified`.
  Closed with no lifecycle label is an anomaly.
- Comments carry conclusions + references (commit/branch/files), not big spec or diff dumps.
- Creating an issue is outward-facing: confirm title/body wording with the human first.
- This track does not touch baton Requirement/Task — no mirroring, no linking. For local
  work items use the baton skill instead.

## Appendix: sub-issues (optional)

When a human explicitly wants GitHub-side hierarchy, the sub-issues API is reachable via
`gh api` (no native gh subcommand yet); it takes the child's numeric **id**, not its #number:

```bash
gh api repos/{owner}/{repo}/issues/{n}/sub_issues                        # list children
gh api -X POST repos/{owner}/{repo}/issues/{n}/sub_issues \
  -F sub_issue_id="$(gh api repos/{owner}/{repo}/issues/<child-n> --jq .id)"  # attach a child
# careful: the numeric REST id (gh api ... --jq .id), NOT the #number or the GraphQL node id
```
