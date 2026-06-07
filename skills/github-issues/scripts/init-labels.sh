#!/usr/bin/env bash
# github-issues init-labels — create the 7 lifecycle/actor labels on the current
# repo (the relay convention). Usage: bash <skill-dir>/scripts/init-labels.sh
# Targets the GitHub repo of the current git remote.
#
# Create-only: the workflow depends on the label NAMES (plus colors for
# consistency). Descriptions are cosmetic and project-local, so this script never
# overwrites an existing label — re-running it leaves labels you already have
# (e.g. ones with localized descriptions) completely untouched.

set -u

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [ -z "$REPO" ]; then
  printf "\033[31m✗\033[0m Not inside a GitHub repo, or gh is not authenticated. cd into the target project and run gh auth login.\n"
  exit 1
fi

EXISTING=$(gh label list --limit 200 --json name --jq '.[].name' 2>/dev/null || echo "")

printf "\n  Creating issue labels on %s\n  ─────────────────\n" "$REPO"

create() {
  local name="$1" color="$2" desc="$3"
  if printf '%s\n' "$EXISTING" | grep -qxF "$name"; then
    printf "  \033[33m=\033[0m  %s (exists, left as-is)\n" "$name"
    return
  fi
  if gh label create "$name" --color "$color" --description "$desc" >/dev/null 2>&1; then
    printf "  \033[32m✓\033[0m  %s (created)\n" "$name"
  else
    printf "  \033[31m✗\033[0m  %s (creation failed, check permissions)\n" "$name"
  fi
}

# AI handler (purple) — who is meant to execute (a label, not an assignee)
create "actor:claude-code"  "5319e7" "Meant for Claude Code (human-triggered)"
create "actor:helm-agent"   "5319e7" "Handled by Helm's automatic loop"
create "actor:scheduled"    "5319e7" "Taken over by a scheduled job"

# Lifecycle states
create "state:in-progress"         "fbca04" "Assignee is working"
create "state:needs-clarification" "d93f0b" "Waiting for the creator to add info"
create "state:needs-verification"  "1d76db" "Closed, waiting for the creator to verify"
create "state:verified"            "0e8a16" "Creator has personally verified"

printf "  ─────────────────\n  done.\n\n"
