#!/bin/sh
# Register this machine as a baton worker (idempotent — keyed by the machineId
# persisted on the baton_state volume), then run the worker daemon. The daemon
# spawns the configured agent per turn in a git worktree off /repo (cwd).
set -e

: "${BATON_URL:?set BATON_URL in .env}"
: "${BATON_PROJECT_ID:?set BATON_PROJECT_ID in .env}"

# BATON_WORKER_CONFIG (optional, entrypoint-only) is translated into the CLI's
# `--config` flag — needed when a second worker shares this repo dir (cwd=/repo),
# so the two daemons own distinct identity files instead of fighting over
# ./.baton.json. The baton CLI itself does not read this env, only the flag.
cfg="${BATON_WORKER_CONFIG:-.baton.json}"
name="${WORKER_NAME:-$(hostname)}"
agent_kind="${BATON_AGENT_KIND:-claude-code}"
base_branch="${BATON_BASE_BRANCH:-current branch}"
echo "[baton] registering worker (project ${BATON_PROJECT_ID}, name ${name}, agent ${agent_kind}, base ${base_branch}) against ${BATON_URL}..."
baton worker register \
  --config "$cfg" \
  --url "$BATON_URL" \
  --project "$BATON_PROJECT_ID" \
  --name "$name" \
  --agentKind "$agent_kind"

# Registration may use site-level credentials, but the daemon and its session
# children need only the worker token persisted in the config file.
unset BATON_TOKEN BATON_USER BATON_PASS

echo "[baton] worker run..."
exec baton worker run --config "$cfg"
