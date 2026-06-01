-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "scrollOffset" INTEGER NOT NULL DEFAULT 0,
    "deviceType" TEXT NOT NULL DEFAULT 'desktop',
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOpenedAt" DATETIME,
    CONSTRAINT "UserFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserFile" ("id", "lastOpenedAt", "name", "path", "scrollOffset", "uploadedAt", "userId") SELECT "id", "lastOpenedAt", "name", "path", "scrollOffset", "uploadedAt", "userId" FROM "UserFile";
DROP TABLE "UserFile";
ALTER TABLE "new_UserFile" RENAME TO "UserFile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
