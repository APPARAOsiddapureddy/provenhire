CREATE TABLE "DsaFollowUpQuestion" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "followUpQuestionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOptionText" TEXT NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DsaFollowUpQuestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DsaSubmission" ADD COLUMN "followUpScore" INTEGER;
ALTER TABLE "DsaSubmission" ADD COLUMN "followUpResults" JSONB;

CREATE UNIQUE INDEX "DsaFollowUpQuestion_questionId_followUpQuestionId_key" ON "DsaFollowUpQuestion"("questionId", "followUpQuestionId");
CREATE INDEX "DsaFollowUpQuestion_questionId_followUpQuestionId_idx" ON "DsaFollowUpQuestion"("questionId", "followUpQuestionId");

ALTER TABLE "DsaFollowUpQuestion" ADD CONSTRAINT "DsaFollowUpQuestion_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "DsaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
