-- AlterTable
ALTER TABLE "Session" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE INDEX "Session_shareToken_idx" ON "Session"("shareToken");
