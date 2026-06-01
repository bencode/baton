-- AlterTable
ALTER TABLE "User" ADD COLUMN "apiToken" TEXT;

-- CreateIndex
CREATE INDEX "User_apiToken_idx" ON "User"("apiToken");
