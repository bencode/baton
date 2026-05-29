/*
  Warnings:

  - You are about to drop the `SessionEvent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SessionEvent";
PRAGMA foreign_keys=on;
