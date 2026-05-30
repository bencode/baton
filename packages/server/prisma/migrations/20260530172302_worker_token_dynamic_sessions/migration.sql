/*
  Warnings:

  - You are about to drop the column `apiToken` on the `Session` table. All the data in the column will be lost.
  - Added the required column `apiToken` to the `Worker` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
CREATE TABLE "new_Worker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "machineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Worker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Worker" ("createdAt", "hostname", "id", "machineId", "name", "projectId") SELECT "createdAt", "hostname", "id", "machineId", "name", "projectId" FROM "Worker";
DROP TABLE "Worker";
ALTER TABLE "new_Worker" RENAME TO "Worker";
CREATE UNIQUE INDEX "Worker_apiToken_key" ON "Worker"("apiToken");
CREATE UNIQUE INDEX "Worker_projectId_machineId_key" ON "Worker"("projectId", "machineId");
CREATE UNIQUE INDEX "Worker_projectId_name_key" ON "Worker"("projectId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
