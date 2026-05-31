-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLocked" BOOLEAN NOT NULL DEFAULT false,
    "agentKind" TEXT NOT NULL,
    "agentSessionId" TEXT,
    "worktreePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("agentKind", "agentSessionId", "createdAt", "id", "mode", "name", "projectId", "updatedAt", "workerId", "worktreePath") SELECT "agentKind", "agentSessionId", "createdAt", "id", "mode", "name", "projectId", "updatedAt", "workerId", "worktreePath" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");
CREATE INDEX "Session_workerId_idx" ON "Session"("workerId");
CREATE UNIQUE INDEX "Session_agentKind_agentSessionId_key" ON "Session"("agentKind", "agentSessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
