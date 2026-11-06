-- AlterTable
ALTER TABLE "WorkerCreation" ADD COLUMN     "hostId" INTEGER;

-- CreateTable
CREATE TABLE "Host" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostWorkspace" (
    "hostId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostWorkspace_pkey" PRIMARY KEY ("hostId","workspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Host_name_key" ON "Host"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Host_token_key" ON "Host"("token");

-- CreateIndex
CREATE INDEX "HostWorkspace_workspaceId_idx" ON "HostWorkspace"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkerCreation_hostId_status_idx" ON "WorkerCreation"("hostId", "status");

-- Backfill: every existing creation ran on the one machine there was. Its token
-- is replaced with `baton host rotate mini` after deploy.
INSERT INTO "Host" ("name", "token") VALUES ('mini', gen_random_uuid()::text || gen_random_uuid()::text);
INSERT INTO "HostWorkspace" ("hostId", "workspaceId")
SELECT h."id", w."id" FROM "Host" h CROSS JOIN "Workspace" w WHERE h."name" = 'mini';
UPDATE "WorkerCreation" SET "hostId" = (SELECT "id" FROM "Host" WHERE "name" = 'mini');
ALTER TABLE "WorkerCreation" ALTER COLUMN "hostId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "HostWorkspace" ADD CONSTRAINT "HostWorkspace_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostWorkspace" ADD CONSTRAINT "HostWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCreation" ADD CONSTRAINT "WorkerCreation_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
