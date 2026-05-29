/*
  Warnings:

  - You are about to drop the column `code` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `heartbeatAt` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `Session` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Worker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "machineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "Worker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "machineId" TEXT,
    "hostname" TEXT,
    "workerName" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("apiToken", "claudeSessionId", "closedAt", "id", "mode", "name", "projectId", "startedAt", "worktreePath") SELECT "apiToken", "claudeSessionId", "closedAt", "id", "mode", "name", "projectId", "startedAt", "worktreePath" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_apiToken_key" ON "Session"("apiToken");
CREATE UNIQUE INDEX "Session_claudeSessionId_key" ON "Session"("claudeSessionId");
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");
CREATE INDEX "Session_machineId_idx" ON "Session"("machineId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Worker_projectId_machineId_idx" ON "Worker"("projectId", "machineId");

-- CreateIndex
CREATE INDEX "Worker_projectId_name_idx" ON "Worker"("projectId", "name");
