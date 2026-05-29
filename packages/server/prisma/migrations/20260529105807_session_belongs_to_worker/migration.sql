-- M2.6.1: Session physically binds to a Worker + an agent-specific session.
-- Drops the M2.6 snapshot strings (machineId/hostname/workerName), adds:
--   - workerId INT NOT NULL FK → Worker(id) ON DELETE RESTRICT
--   - agentKind  TEXT NOT NULL  ('claude-code' v0; 'codex' later)
--   - agentSessionId TEXT NOT NULL  (renamed from claudeSessionId; per-agentKind unique)
--   - worktreePath TEXT NOT NULL  (was nullable)
--   - updatedAt DATETIME NOT NULL  (M2.6.1 housekeeping)
-- Session table is empty (cleaned manually before this migration) so the
-- NOT NULL columns can be added without backfill.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "agentKind" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "worktreePath" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("apiToken", "closedAt", "id", "mode", "name", "projectId", "startedAt", "worktreePath") SELECT "apiToken", "closedAt", "id", "mode", "name", "projectId", "startedAt", "worktreePath" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_apiToken_key" ON "Session"("apiToken");
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");
CREATE INDEX "Session_workerId_idx" ON "Session"("workerId");
CREATE UNIQUE INDEX "Session_agentKind_agentSessionId_key" ON "Session"("agentKind", "agentSessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Review item B: enforce "alive uniqueness" on Worker at the DB level via
-- partial unique indexes (Prisma 7 schema can't express WHERE closedAt IS NULL).
CREATE UNIQUE INDEX "Worker_projectId_machineId_alive_unique"
  ON "Worker"("projectId", "machineId") WHERE "closedAt" IS NULL;
CREATE UNIQUE INDEX "Worker_projectId_name_alive_unique"
  ON "Worker"("projectId", "name") WHERE "closedAt" IS NULL;
