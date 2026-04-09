-- CreateTable
CREATE TABLE "NonTechAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subtrack" TEXT NOT NULL,
    "experienceTier" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "attemptIndex" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "submittedFileUrl" TEXT,
    "submittedText" TEXT,
    "score" INTEGER,
    "passed" BOOLEAN,
    "feedbackSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonTechAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NonTechAssignment_userId_status_idx" ON "NonTechAssignment"("userId", "status");

-- AddForeignKey
ALTER TABLE "NonTechAssignment" ADD CONSTRAINT "NonTechAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
