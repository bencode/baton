-- M2.9: Drop soft-delete (closedAt) on Worker + Session.
-- Rename startedAt → createdAt (alignment with Workspace/Project/Requirement/Task).
-- Worker → Session FK changes onDelete from Restrict to Cascade (destroy worker
-- nukes its sessions + events). Worker's M2.6.1 partial unique indexes (WHERE
-- closedAt IS NULL) collapse to plain UNIQUE since closedAt is gone.
--
-- Existing data: closedAt values are discarded; startedAt values are copied
-- into createdAt (timestamps preserved). Any pre-existing closed sessions
-- (e.g. dogfood project's testflow) become regular sessions in the new model.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Session: drop closedAt, rename startedAt → createdAt, FK Cascade on worker.
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" (
    "id", "projectId", "workerId", "mode", "name", "apiToken",
    "agentKind", "agentSessionId", "worktreePath",
    "createdAt", "updatedAt"
)
SELECT
    "id", "projectId", "workerId", "mode", "name", "apiToken",
    "agentKind", "agentSessionId", "worktreePath",
    "startedAt", "updatedAt"
FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_apiToken_key" ON "Session"("apiToken");
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");
CREATE INDEX "Session_workerId_idx" ON "Session"("workerId");
CREATE UNIQUE INDEX "Session_agentKind_agentSessionId_key" ON "Session"("agentKind", "agentSessionId");

-- Worker: drop closedAt, rename startedAt → createdAt, partial unique → plain unique.
CREATE TABLE "new_Worker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "machineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Worker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Worker" ("id", "projectId", "machineId", "name", "hostname", "createdAt")
SELECT "id", "projectId", "machineId", "name", "hostname", "startedAt"
FROM "Worker";
DROP TABLE "Worker";
ALTER TABLE "new_Worker" RENAME TO "Worker";
CREATE UNIQUE INDEX "Worker_projectId_machineId_key" ON "Worker"("projectId", "machineId");
CREATE UNIQUE INDEX "Worker_projectId_name_key" ON "Worker"("projectId", "name");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
