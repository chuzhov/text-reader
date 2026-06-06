/*
  Warnings:

  - You are about to drop the column `deviceType` on the `UserFile` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActiveWord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "wordId" INTEGER NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" DATETIME,
    CONSTRAINT "ActiveWord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActiveWord_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ActiveWord" ("addedAt", "id", "lastReviewedAt", "userId", "wordId") SELECT "addedAt", "id", "lastReviewedAt", "userId", "wordId" FROM "ActiveWord";
DROP TABLE "ActiveWord";
ALTER TABLE "new_ActiveWord" RENAME TO "ActiveWord";
CREATE UNIQUE INDEX "ActiveWord_userId_wordId_key" ON "ActiveWord"("userId", "wordId");
CREATE TABLE "new_UserFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL DEFAULT 'en',
    "targetLang" TEXT NOT NULL DEFAULT 'ru',
    "scrollOffset" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOpenedAt" DATETIME,
    CONSTRAINT "UserFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserFile" ("id", "lastOpenedAt", "name", "path", "scrollOffset", "uploadedAt", "userId") SELECT "id", "lastOpenedAt", "name", "path", "scrollOffset", "uploadedAt", "userId" FROM "UserFile";
DROP TABLE "UserFile";
ALTER TABLE "new_UserFile" RENAME TO "UserFile";
CREATE TABLE "new_Word" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "word" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "sourceLang" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Word_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Word" ("addedAt", "id", "sourceLang", "targetLang", "translation", "userId", "word") SELECT "addedAt", "id", "sourceLang", "targetLang", "translation", "userId", "word" FROM "Word";
DROP TABLE "Word";
ALTER TABLE "new_Word" RENAME TO "Word";
CREATE UNIQUE INDEX "Word_userId_word_sourceLang_key" ON "Word"("userId", "word", "sourceLang");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
