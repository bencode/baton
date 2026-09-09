/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,loopId]` on the table `SessionPendingInput` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SessionPendingInput" ADD COLUMN "loopId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SessionPendingInput_sessionId_loopId_key" ON "SessionPendingInput"("sessionId", "loopId");
