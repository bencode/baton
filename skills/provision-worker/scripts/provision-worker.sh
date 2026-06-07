#!/usr/bin/env bash
# provision-worker — clone a repo, register a new baton worker on it, and start
# it under launchd so it survives turns/reboots. Run this ON the target macOS
# host (a host worker agent there has local launchctl + fs + reclaude).
#
# Each provisioned worker gets its OWN XDG_DATA_HOME → its own machineId +
# worktrees, so it's a distinct worker regardless of project.
#
# Provision-only. Teardown is manual (see SKILL.md): launchctl bootout + rm
# plist + `baton worker destroy <W-N> --confirm`.
set -euo pipefail

NAME="" REPO="" PROJECT="" NEW_PROJECT="" WORKSPACE="" DIR=""
CLAUDE_BIN="/Users/$(id -un)/.local/bin/reclaude"
SERVER="https://baton.fmap.dev/api"

die() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m•\033[0m %s\n' "$*"; }
ok() { printf '\033[32m✓\033[0m %s\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2;;
    --repo) REPO="$2"; shift 2;;
    --project) PROJECT="$2"; shift 2;;
    --new-project) NEW_PROJECT="$2"; shift 2;;
    --workspace) WORKSPACE="$2"; shift 2;;
    --claude-bin) CLAUDE_BIN="$2"; shift 2;;
    --dir) DIR="$2"; shift 2;;
    --server) SERVER="$2"; shift 2;;
    *) die "unknown arg: $1 (see SKILL.md)";;
  esac
done

[ -n "$NAME" ] || die "--name required"
[ -n "$REPO" ] || die "--repo required (git url or local path)"
[ -n "$PROJECT" ] || [ -n "$NEW_PROJECT" ] || die "pass --project <id> or --new-project <name> --workspace <id>"
[ "$(uname -s)" = "Darwin" ] || die "run on the macOS host (needs launchctl)"
for c in git jq launchctl baton node; do command -v "$c" >/dev/null || die "missing on PATH: $c"; done
[ -x "$CLAUDE_BIN" ] || die "claude binary not executable: $CLAUDE_BIN (reclaude logged in?)"

DIR="${DIR:-$HOME/work/$NAME}"
STATE="$HOME/.local/share/baton-workers/$NAME"   # per-worker XDG_DATA_HOME
PLIST="$HOME/Library/LaunchAgents/dev.fmap.baton-worker-$NAME.plist"
LOG="$HOME/Library/Logs/baton-worker-$NAME.log"
LABEL="dev.fmap.baton-worker-$NAME"

[ -e "$PLIST" ] && die "plist already exists: $PLIST (teardown first — see SKILL.md)"

# 1) auth token — env first, else borrow the baton host worker's (site-wide).
TOKEN="${BATON_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$HOME/work/baton/.baton.json" ]; then
  TOKEN=$(jq -r '.worker.apiToken // empty' "$HOME/work/baton/.baton.json")
fi
[ -n "$TOKEN" ] || die "no auth token (set BATON_TOKEN, or have ~/work/baton/.baton.json with a worker token)"

# 2) resolve project
if [ -n "$NEW_PROJECT" ]; then
  [ -n "$WORKSPACE" ] || die "--new-project needs --workspace <id>"
  info "creating project '$NEW_PROJECT' in workspace $WORKSPACE"
  PROJECT=$(BATON_TOKEN="$TOKEN" baton project create "$NEW_PROJECT" --workspace "$WORKSPACE" --url "$SERVER" --json | jq -r '.id')
  [ -n "$PROJECT" ] && [ "$PROJECT" != "null" ] || die "project create failed"
  ok "project $PROJECT created"
fi

# 3) clone (or reuse) the repo
if [ -d "$DIR/.git" ]; then
  info "repo dir exists, reusing: $DIR"
elif [ -d "$REPO/.git" ]; then
  DIR="$REPO"; info "using local repo: $DIR"
else
  info "git clone $REPO → $DIR"
  git clone "$REPO" "$DIR" || die "git clone failed"
fi

# 4) register with an isolated identity (own machineId + worktrees)
mkdir -p "$STATE/baton"
info "registering worker '$NAME' on project $PROJECT (state: $STATE)"
REG=$(cd "$DIR" && XDG_DATA_HOME="$STATE" BATON_TOKEN="$TOKEN" \
  baton worker register --project "$PROJECT" --url "$SERVER" --name "$NAME" --json) \
  || die "register failed (name already in use in this project? pick another --name)"
WID=$(printf '%s' "$REG" | jq -r '.worker.id')
ok "registered worker W-$WID ($NAME)"

# 5) write the launchd plist (template the node + baton.mjs ProgramArguments
#    from the canonical baton worker plist; fall back to PATH + npm root -g).
TEMPLATE="$HOME/Library/LaunchAgents/dev.fmap.baton-worker-baton.plist"
if [ -f "$TEMPLATE" ]; then
  NODE=$(/usr/libexec/PlistBuddy -c "Print :ProgramArguments:0" "$TEMPLATE")
  MJS=$(/usr/libexec/PlistBuddy -c "Print :ProgramArguments:1" "$TEMPLATE")
  PATHV=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:PATH" "$TEMPLATE")
else
  NODE=$(command -v node)
  MJS="$(npm root -g)/@lesscap/baton-cli/dist/baton.mjs"
  PATHV="$HOME/.local/bin:$(dirname "$NODE"):/opt/homebrew/bin:/usr/bin:/bin"
fi
[ -f "$MJS" ] || die "baton.mjs not found at $MJS"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$MJS</string>
    <string>worker</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$PATHV</string>
    <key>HOME</key><string>$HOME</string>
    <key>BATON_REPO_DIR</key><string>$DIR</string>
    <key>BATON_CLAUDE_BIN</key><string>$CLAUDE_BIN</string>
    <key>XDG_DATA_HOME</key><string>$STATE</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
ok "wrote $PLIST"

# 6) start it. launchctl from within a launchd-spawned agent may fail to reach
#    the gui domain — if so, leave the plist and print the command to run by hand.
if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/tmp/pw-boot.err; then
  ok "bootstrapped $LABEL"
else
  printf '\033[33m!\033[0m bootstrap failed (%s). plist is written; run this yourself:\n  launchctl bootstrap gui/%s %s\n' \
    "$(tr -d '\n' </tmp/pw-boot.err)" "$(id -u)" "$PLIST" >&2
fi

# 7) verify alive (~60s)
info "waiting for W-$WID to come alive…"
for _ in $(seq 1 12); do
  if BATON_TOKEN="$TOKEN" baton worker ls --project "$PROJECT" --url "$SERVER" --json \
      | jq -e --argjson id "$WID" '.[] | select(.id==$id and .alive==true)' >/dev/null 2>&1; then
    ok "W-$WID ($NAME) is alive on project $PROJECT"
    echo
    echo "  delegate to it:  baton session create \"<task>\" --worker $WID --json"
    echo "  (or use the delegate skill)"
    exit 0
  fi
  sleep 5
done
die "W-$WID registered but not alive after 60s — check $LOG"
