-- CreateTable
CREATE TABLE "Loop" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "intervalSec" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loop_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Loop_sessionId_idx" ON "Loop"("sessionId");

-- CreateIndex
CREATE INDEX "Loop_enabled_nextRunAt_idx" ON "Loop"("enabled", "nextRunAt");
