-- AlterTable
ALTER TABLE "DsaTestCase" ADD COLUMN "expectedType" TEXT NOT NULL DEFAULT 'exact';

-- AlterTable
ALTER TABLE "DsaTestCase" ADD COLUMN "timeoutMs" INTEGER;

-- CreateTable
CREATE TABLE "DsaSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "passedCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "results" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DsaSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DsaSubmission_userId_questionId_idx" ON "DsaSubmission"("userId", "questionId");

-- CreateIndex
CREATE INDEX "DsaSubmission_userId_isOfficial_idx" ON "DsaSubmission"("userId", "isOfficial");
