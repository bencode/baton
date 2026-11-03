#!/bin/sh
# Weekly full backup and a WAL archive check every few minutes. The stanza and repository
# come from PGBACKREST_* in the environment.
set -eu

: "${PGBACKREST_STANZA:?PGBACKREST_STANZA is required}"
full_interval=${PHYSICAL_BACKUP_INTERVAL_SECONDS:-604800}
check_interval=${PHYSICAL_BACKUP_CHECK_SECONDS:-300}

check_and_backup() {
  latest=$(pgbackrest --output=json info |
    jq -er '[.[].backup[]? | select(.type == "full") | .timestamp.stop] | max // 0') || return
  if [ "$(($(date +%s) - latest))" -ge "$full_interval" ]; then
    # A running full counts as healthy, so a long backup is not reported as a failure.
    touch /tmp/physical-backup-running
    pgbackrest --type=full backup || {
      rm -f /tmp/physical-backup-running
      return 1
    }
    rm -f /tmp/physical-backup-running
  fi
  pgbackrest check || return
  touch /tmp/physical-backup-ok
}

pgbackrest stanza-create
while true; do
  if check_and_backup; then
    echo 'Physical backup and WAL archive check succeeded.'
  else
    echo 'ERROR: physical backup or WAL archive check failed; retrying next interval.' >&2
  fi
  sleep "$check_interval"
done
