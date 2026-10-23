-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Loop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "intervalSec" INTEGER NOT NULL,
    "clearAfterSec" INTEGER,
    "nextClearAt" DATETIME,
    "clearEveryRuns" INTEGER,
    "runsSinceClear" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loop_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Loop" ("clearAfterSec", "createdAt", "enabled", "id", "intervalSec", "lastRunAt", "lastStatus", "message", "name", "nextClearAt", "nextRunAt", "sessionId", "updatedAt") SELECT "clearAfterSec", "createdAt", "enabled", "id", "intervalSec", "lastRunAt", "lastStatus", "message", "name", "nextClearAt", "nextRunAt", "sessionId", "updatedAt" FROM "Loop";
DROP TABLE "Loop";
ALTER TABLE "new_Loop" RENAME TO "Loop";
CREATE INDEX "Loop_sessionId_idx" ON "Loop"("sessionId");
CREATE INDEX "Loop_enabled_nextRunAt_idx" ON "Loop"("enabled", "nextRunAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Convert time-based clearing to run counts: ceil(clearAfterSec / intervalSec).
UPDATE "Loop" SET "clearEveryRuns" = ("clearAfterSec" + "intervalSec" - 1) / "intervalSec" WHERE "clearAfterSec" IS NOT NULL;
