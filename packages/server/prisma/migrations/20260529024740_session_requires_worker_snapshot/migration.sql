/*
  Warnings:

  - Made the column `hostname` on table `Session` required. This step will fail if there are existing NULL values in that column.
  - Made the column `machineId` on table `Session` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workerName` on table `Session` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "claudeSessionId" TEXT,
    "worktreePath" TEXT,
    "machineId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("apiToken", "claudeSessionId", "closedAt", "hostname", "id", "machineId", "mode", "name", "projectId", "startedAt", "workerName", "worktreePath") SELECT "apiToken", "claudeSessionId", "closedAt", "hostname", "id", "machineId", "mode", "name", "projectId", "startedAt", "workerName", "worktreePath" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_apiToken_key" ON "Session"("apiToken");
CREATE UNIQUE INDEX "Session_claudeSessionId_key" ON "Session"("claudeSessionId");
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");
CREATE INDEX "Session_machineId_idx" ON "Session"("machineId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
