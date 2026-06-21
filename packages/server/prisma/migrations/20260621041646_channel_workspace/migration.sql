/*
  Warnings:

  - Added the required column `workspaceId` to the `Channel` table without a default value. This is not possible if the table is not empty.

*/
-- Channels predate workspace ownership; the only existing rows are throwaway test
-- rooms with no workspace to assign. Clear them (messages first, then channels) so
-- the new required workspaceId column can be added cleanly. Fresh channels are
-- created via POST /workspaces/:id/channels with a real workspace.
DELETE FROM "ChannelMessage";
DELETE FROM "Channel";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Channel" ("createdAt", "description", "id", "title", "token") SELECT "createdAt", "description", "id", "title", "token" FROM "Channel";
DROP TABLE "Channel";
ALTER TABLE "new_Channel" RENAME TO "Channel";
CREATE INDEX "Channel_workspaceId_idx" ON "Channel"("workspaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
