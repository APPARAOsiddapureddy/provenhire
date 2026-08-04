-- Very Easy is a coding (DSA) only difficulty tier. Existing rounds default to 0,
-- so their difficulty split stays valid without a backfill.
ALTER TABLE "WorkspaceRound"
ADD COLUMN "veryEasyCount" INTEGER NOT NULL DEFAULT 0;
