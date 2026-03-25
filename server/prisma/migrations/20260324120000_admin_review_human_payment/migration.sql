-- Admin review queue + human interview payment attempts
CREATE TABLE "AdminReviewQueue" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "aiInterviewId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,

    CONSTRAINT "AdminReviewQueue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminReviewQueue_aiInterviewId_key" ON "AdminReviewQueue"("aiInterviewId");
CREATE INDEX "AdminReviewQueue_candidateId_idx" ON "AdminReviewQueue"("candidateId");
CREATE INDEX "AdminReviewQueue_status_createdAt_idx" ON "AdminReviewQueue"("status", "createdAt");

CREATE TABLE "HumanInterviewAttempt" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "adminReviewQueueId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "slotId" TEXT,
    "amountPaise" INTEGER,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanInterviewAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HumanInterviewAttempt_razorpayOrderId_key" ON "HumanInterviewAttempt"("razorpayOrderId");
CREATE INDEX "HumanInterviewAttempt_candidateId_idx" ON "HumanInterviewAttempt"("candidateId");
CREATE INDEX "HumanInterviewAttempt_adminReviewQueueId_idx" ON "HumanInterviewAttempt"("adminReviewQueueId");

ALTER TABLE "AdminReviewQueue" ADD CONSTRAINT "AdminReviewQueue_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminReviewQueue" ADD CONSTRAINT "AdminReviewQueue_aiInterviewId_fkey" FOREIGN KEY ("aiInterviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminReviewQueue" ADD CONSTRAINT "AdminReviewQueue_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HumanInterviewAttempt" ADD CONSTRAINT "HumanInterviewAttempt_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanInterviewAttempt" ADD CONSTRAINT "HumanInterviewAttempt_adminReviewQueueId_fkey" FOREIGN KEY ("adminReviewQueueId") REFERENCES "AdminReviewQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanInterviewAttempt" ADD CONSTRAINT "HumanInterviewAttempt_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "InterviewerSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HumanInterviewSession" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HumanInterviewSession" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'waived';
ALTER TABLE "HumanInterviewSession" ADD COLUMN "humanInterviewAttemptId" TEXT;

CREATE UNIQUE INDEX "HumanInterviewSession_humanInterviewAttemptId_key" ON "HumanInterviewSession"("humanInterviewAttemptId");

ALTER TABLE "HumanInterviewSession" ADD CONSTRAINT "HumanInterviewSession_humanInterviewAttemptId_fkey" FOREIGN KEY ("humanInterviewAttemptId") REFERENCES "HumanInterviewAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;