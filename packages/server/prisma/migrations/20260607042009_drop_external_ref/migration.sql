/*
  Warnings:

  - You are about to drop the column `externalNumber` on the `Requirement` table. All the data in the column will be lost.
  - You are about to drop the column `externalSource` on the `Requirement` table. All the data in the column will be lost.
  - You are about to drop the column `externalUrl` on the `Requirement` table. All the data in the column will be lost.
  - You are about to drop the column `externalNumber` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `externalSource` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `externalUrl` on the `Task` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Requirement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT,
    "resources" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Requirement" ("body", "code", "createdAt", "description", "id", "projectId", "resources", "status", "title", "updatedAt") SELECT "body", "code", "createdAt", "description", "id", "projectId", "resources", "status", "title", "updatedAt" FROM "Requirement";
DROP TABLE "Requirement";
ALTER TABLE "new_Requirement" RENAME TO "Requirement";
CREATE INDEX "Requirement_projectId_idx" ON "Requirement"("projectId");
CREATE INDEX "Requirement_status_idx" ON "Requirement"("status");
CREATE UNIQUE INDEX "Requirement_projectId_code_key" ON "Requirement"("projectId", "code");
CREATE TABLE "new_Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requirementId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("body", "code", "createdAt", "dependsOn", "id", "projectId", "requirementId", "status", "title", "updatedAt") SELECT "body", "code", "createdAt", "dependsOn", "id", "projectId", "requirementId", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_requirementId_idx" ON "Task"("requirementId");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE UNIQUE INDEX "Task_projectId_code_key" ON "Task"("projectId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
