-- Drop Requirement.tags: cosmetic-only chips in the web UI, zero semantic use
-- (no filter / search / scheduling). Removed to keep the core flow tight; can
-- be re-added intentionally when there's a concrete use case (tag-based filter,
-- saved searches, …).

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Requirement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resources" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Requirement" ("code", "createdAt", "description", "id", "projectId", "resources", "status", "title", "updatedAt") SELECT "code", "createdAt", "description", "id", "projectId", "resources", "status", "title", "updatedAt" FROM "Requirement";
DROP TABLE "Requirement";
ALTER TABLE "new_Requirement" RENAME TO "Requirement";
CREATE INDEX "Requirement_projectId_idx" ON "Requirement"("projectId");
CREATE INDEX "Requirement_status_idx" ON "Requirement"("status");
CREATE UNIQUE INDEX "Requirement_projectId_code_key" ON "Requirement"("projectId", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
