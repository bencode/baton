#!/bin/sh
# Register this machine as a baton worker (idempotent — keyed by the machineId
# persisted on the baton_state volume), then run the worker daemon. The daemon
# spawns `claude` per turn in a git worktree off /repo (cwd).
set -e

: "${BATON_URL:?set BATON_URL in .env}"
: "${BATON_PROJECT_ID:?set BATON_PROJECT_ID in .env}"

if [ ! -f .baton.json ]; then
  name="${WORKER_NAME:-$(hostname)}"
  echo "[baton] registering worker (project ${BATON_PROJECT_ID}, name ${name}) against ${BATON_URL}..."
  baton worker register --url "$BATON_URL" --project "$BATON_PROJECT_ID" --name "$name"
fi

echo "[baton] worker run..."
exec baton worker run
