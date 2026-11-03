# baton PostgreSQL continuous backup (pgBackRest → OSS)

```text
postgres (postgres:18-alpine + pgBackRest)
  └─ archive_command = pgbackrest archive-push (async) ──> oss://<bucket>/pgbackrest/i-baton/archive/
pg-backup (same image, postgres user, PGDATA and socket mounted read-only)
  └─ check every 5 min; full when the last one is 7 days old ──> oss://<bucket>/pgbackrest/i-baton/backup/
```

- Covers the whole instance; restore is per instance. Up to ~5 minutes of writes can be lost
  (`archive_timeout=300s`) plus upload time.
- Retention is by time, 30 days, managed by pgBackRest. Never put an age-based OSS lifecycle rule
  on `pgbackrest/`: it would cut the recovery chain.
- Unarchived WAL over `archive-push-queue-max=5GiB` is dropped (`dropped WAL file` in the
  database log) so the disk never fills; PITR breaks there until the next full, so take one at once.
- Keep `init: true` on both services (see the comment in docker-compose.yml).
- The OSS bucket and keys go in `docker/pgbackrest.env` (template: `pgbackrest.env.example`).

Checks:

```bash
docker exec -u postgres baton-postgres-1 pgbackrest info
docker logs --tail 50 baton-pg-backup-1
docker exec baton-postgres-1 psql -U baton -d baton -c 'TABLE pg_stat_archiver'
docker logs --since 24h baton-postgres-1 2>&1 | grep 'dropped WAL file'
docker exec baton-pg-backup-1 pgbackrest --type=full backup   # after a dropped WAL file
```

Point-in-time restore goes into a new, empty directory, never over the live volume: run
`pgbackrest --pg1-path=<new dir> --type=time --target='<time>' --target-action=promote
--archive-mode=off restore` with this image and the same `PGBACKREST_*` settings, start a separate
PostgreSQL on that directory and check the data before deciding anything else.
The target time needs at least one archived commit after it (recovery stops just before it);
otherwise PostgreSQL fails with `recovery ended before configured recovery target was reached`.
For a fresh incident, wait for the next WAL segment to be archived (up to ~5 minutes) or run
`pgbackrest check` to force a switch first.
