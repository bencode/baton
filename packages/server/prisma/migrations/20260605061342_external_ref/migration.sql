/*
  Warnings:

  - A unique constraint covering the columns `[projectId,externalSource,externalNumber]` on the table `Requirement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[projectId,externalSource,externalNumber]` on the table `Task` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "externalNumber" INTEGER;
ALTER TABLE "Requirement" ADD COLUMN "externalSource" TEXT;
ALTER TABLE "Requirement" ADD COLUMN "externalUrl" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "externalNumber" INTEGER;
ALTER TABLE "Task" ADD COLUMN "externalSource" TEXT;
ALTER TABLE "Task" ADD COLUMN "externalUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_projectId_externalSource_externalNumber_key" ON "Requirement"("projectId", "externalSource", "externalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_externalSource_externalNumber_key" ON "Task"("projectId", "externalSource", "externalNumber");
