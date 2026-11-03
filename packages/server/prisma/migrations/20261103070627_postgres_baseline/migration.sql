-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "apiToken" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWorkspace" (
    "userId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWorkspace_pkey" PRIMARY KEY ("userId","workspaceId")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeCounter" (
    "projectId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CodeCounter_pkey" PRIMARY KEY ("projectId","kind")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT,
    "resources" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "requirementId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dependsOn" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "workerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLocked" BOOLEAN NOT NULL DEFAULT false,
    "agentKind" TEXT NOT NULL,
    "agentSessionId" TEXT,
    "cwd" TEXT,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planMode" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "effort" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "contextResetRequested" BOOLEAN NOT NULL DEFAULT false,
    "queueRevision" INTEGER NOT NULL DEFAULT 0,
    "nextEventSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "agentKind" TEXT NOT NULL DEFAULT 'claude-code',
    "machineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCreation" (
    "id" SERIAL NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkerCreation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attemptId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionPendingInput" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "loopId" INTEGER,
    "text" TEXT NOT NULL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "planMode" BOOLEAN NOT NULL,
    "model" TEXT,
    "effort" TEXT,
    "replyExpected" BOOLEAN NOT NULL DEFAULT false,
    "senderUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionPendingInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTurn" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "userEventSequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "openKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SessionTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTurnAttempt" (
    "id" SERIAL NOT NULL,
    "turnId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "claimId" TEXT NOT NULL,
    "runnerToken" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "stopReason" TEXT,
    "stopRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "result" TEXT,

    CONSTRAINT "SessionTurnAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loop" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "name" TEXT,
    "message" TEXT NOT NULL,
    "intervalSec" INTEGER NOT NULL,
    "clearEveryRuns" INTEGER,
    "runsSinceClear" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelMessage" (
    "id" SERIAL NOT NULL,
    "channelId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "senderKind" TEXT NOT NULL DEFAULT 'agent',
    "text" TEXT NOT NULL,
    "to" TEXT,
    "attachments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushCursor" (
    "id" INTEGER NOT NULL,
    "lastEventId" INTEGER NOT NULL,

    CONSTRAINT "PushCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_apiToken_idx" ON "User"("apiToken");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace"("name");

-- CreateIndex
CREATE INDEX "UserWorkspace_workspaceId_idx" ON "UserWorkspace"("workspaceId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_name_key" ON "Project"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Artifact_key_key" ON "Artifact"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Artifact_storageId_key" ON "Artifact"("storageId");

-- CreateIndex
CREATE INDEX "Artifact_projectId_idx" ON "Artifact"("projectId");

-- CreateIndex
CREATE INDEX "Requirement_projectId_idx" ON "Requirement"("projectId");

-- CreateIndex
CREATE INDEX "Requirement_status_idx" ON "Requirement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_projectId_code_key" ON "Requirement"("projectId", "code");

-- CreateIndex
CREATE INDEX "Task_requirementId_idx" ON "Task"("requirementId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_code_key" ON "Task"("projectId", "code");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "Session_projectId_idx" ON "Session"("projectId");

-- CreateIndex
CREATE INDEX "Session_workerId_idx" ON "Session"("workerId");

-- CreateIndex
CREATE INDEX "Session_shareToken_idx" ON "Session"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Session_agentKind_agentSessionId_key" ON "Session"("agentKind", "agentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_apiToken_key" ON "Worker"("apiToken");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_projectId_machineId_key" ON "Worker"("projectId", "machineId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_projectId_name_key" ON "Worker"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCreation_machineId_key" ON "WorkerCreation"("machineId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCreation_workerId_key" ON "WorkerCreation"("workerId");

-- CreateIndex
CREATE INDEX "WorkerCreation_projectId_createdAt_idx" ON "WorkerCreation"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerCreation_status_idx" ON "WorkerCreation"("status");

-- CreateIndex
CREATE INDEX "SessionEvent_attemptId_sequence_idx" ON "SessionEvent"("attemptId", "sequence");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_idx" ON "SessionEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionEvent_sessionId_sequence_key" ON "SessionEvent"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "SessionPendingInput_sessionId_id_idx" ON "SessionPendingInput"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SessionPendingInput_sessionId_loopId_key" ON "SessionPendingInput"("sessionId", "loopId");

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

-- CreateIndex
CREATE INDEX "Loop_sessionId_idx" ON "Loop"("sessionId");

-- CreateIndex
CREATE INDEX "Loop_enabled_nextRunAt_idx" ON "Loop"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "Channel_workspaceId_idx" ON "Channel"("workspaceId");

-- CreateIndex
CREATE INDEX "ChannelMessage_channelId_idx" ON "ChannelMessage"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMessage_channelId_seq_key" ON "ChannelMessage"("channelId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "UserWorkspace" ADD CONSTRAINT "UserWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWorkspace" ADD CONSTRAINT "UserWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeCounter" ADD CONSTRAINT "CodeCounter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCreation" ADD CONSTRAINT "WorkerCreation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCreation" ADD CONSTRAINT "WorkerCreation_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "SessionTurnAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPendingInput" ADD CONSTRAINT "SessionPendingInput_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTurn" ADD CONSTRAINT "SessionTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTurnAttempt" ADD CONSTRAINT "SessionTurnAttempt_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "SessionTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loop" ADD CONSTRAINT "Loop_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
