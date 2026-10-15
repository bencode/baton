-- CreateTable
CREATE TABLE "WorkerCreation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentKind" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "step" TEXT,
    "error" TEXT,
    "repoPath" TEXT,
    "workerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    CONSTRAINT "WorkerCreation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkerCreation_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCreation_machineId_key" ON "WorkerCreation"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCreation_workerId_key" ON "WorkerCreation"("workerId");

-- CreateIndex
CREATE INDEX "WorkerCreation_projectId_createdAt_idx" ON "WorkerCreation"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerCreation_status_idx" ON "WorkerCreation"("status");
