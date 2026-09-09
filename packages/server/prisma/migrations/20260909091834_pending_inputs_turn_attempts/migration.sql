-- CreateTable
CREATE TABLE "SessionPendingInput" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "planMode" BOOLEAN NOT NULL,
    "model" TEXT,
    "effort" TEXT,
    "replyExpected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionPendingInput_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionTurn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "userEventSequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "openKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "SessionTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionTurnAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "turnId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "claimId" TEXT NOT NULL,
    "runnerToken" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leaseUntil" DATETIME NOT NULL,
    "stopReason" TEXT,
    "stopRequestedAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "result" TEXT,
    CONSTRAINT "SessionTurnAttempt_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "SessionTurn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "shareToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planMode" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "effort" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "contextResetRequested" BOOLEAN NOT NULL DEFAULT false,
    "queueRevision" INTEGER NOT NULL DEFAULT 0,
    "nextEventSequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("agentKind", "agentSessionId", "createdAt", "effort", "id", "lastActiveAt", "mode", "model", "name", "nameLocked", "planMode", "projectId", "shareToken", "updatedAt", "workerId", "worktreePath") SELECT "agentKind", "agentSessionId", "createdAt", "effort", "id", "lastActiveAt", "mode", "model", "name", "nameLocked", "planMode", "projectId", "shareToken", "updatedAt", "workerId", "worktreePath" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");
CREATE INDEX "Session_workerId_idx" ON "Session"("workerId");
CREATE INDEX "Session_shareToken_idx" ON "Session"("shareToken");
CREATE UNIQUE INDEX "Session_agentKind_agentSessionId_key" ON "Session"("agentKind", "agentSessionId");
CREATE TABLE "new_SessionEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attemptId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SessionTurnAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SessionEvent" ("createdAt", "id", "payload", "sequence", "sessionId", "type") SELECT "createdAt", "id", "payload", "sequence", "sessionId", "type" FROM "SessionEvent";
DROP TABLE "SessionEvent";
ALTER TABLE "new_SessionEvent" RENAME TO "SessionEvent";
CREATE INDEX "SessionEvent_attemptId_sequence_idx" ON "SessionEvent"("attemptId", "sequence");
CREATE INDEX "SessionEvent_sessionId_idx" ON "SessionEvent"("sessionId");
CREATE UNIQUE INDEX "SessionEvent_sessionId_sequence_key" ON "SessionEvent"("sessionId", "sequence");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SessionPendingInput_sessionId_id_idx" ON "SessionPendingInput"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTurn_openKey_key" ON "SessionTurn"("openKey");

-- CreateIndex
CREATE INDEX "SessionTurn_sessionId_status_idx" ON "SessionTurn"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTurn_sessionId_userEventSequence_key" ON "SessionTurn"("sessionId", "userEventSequence");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTurnAttempt_claimId_key" ON "SessionTurnAttempt"("claimId");

-- CreateIndex
CREATE INDEX "SessionTurnAttempt_status_leaseUntil_idx" ON "SessionTurnAttempt"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTurnAttempt_turnId_number_key" ON "SessionTurnAttempt"("turnId", "number");
