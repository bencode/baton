/*
  Warnings:

  - You are about to drop the `Assignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AssignmentEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `capabilities` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `requires` on the `Task` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Assignment_projectId_code_key";

-- DropIndex
DROP INDEX "Assignment_status_idx";

-- DropIndex
DROP INDEX "Assignment_taskId_idx";

-- DropIndex
DROP INDEX "Assignment_sessionId_idx";

-- DropIndex
DROP INDEX "Assignment_projectId_idx";

-- DropIndex
DROP INDEX "AssignmentEvent_assignmentId_sequence_key";

-- DropIndex
DROP INDEX "AssignmentEvent_assignmentId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Assignment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AssignmentEvent";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'idle',
    "claudeSessionId" TEXT,
    "worktreePath" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("apiToken", "closedAt", "code", "heartbeatAt", "id", "mode", "name", "projectId", "startedAt") SELECT "apiToken", "closedAt", "code", "heartbeatAt", "id", "mode", "name", "projectId", "startedAt" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_apiToken_key" ON "Session"("apiToken");
CREATE UNIQUE INDEX "Session_claudeSessionId_key" ON "Session"("claudeSessionId");
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");
CREATE INDEX "Session_state_idx" ON "Session"("state");
CREATE UNIQUE INDEX "Session_projectId_code_key" ON "Session"("projectId", "code");
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requirementId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "spec" TEXT,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("code", "createdAt", "dependsOn", "id", "projectId", "requirementId", "spec", "status", "title", "updatedAt") SELECT "code", "createdAt", "dependsOn", "id", "projectId", "requirementId", "spec", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_requirementId_idx" ON "Task"("requirementId");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE UNIQUE INDEX "Task_projectId_code_key" ON "Task"("projectId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_idx" ON "SessionEvent"("sessionId");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_processedAt_idx" ON "SessionEvent"("sessionId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionEvent_sessionId_sequence_key" ON "SessionEvent"("sessionId", "sequence");
