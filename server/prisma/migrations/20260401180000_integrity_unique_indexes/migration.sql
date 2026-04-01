-- Deduplicate verification stages (keep latest row per user + stage)
DELETE FROM "VerificationStage"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "userId", "stageName"
             ORDER BY "updatedAt" DESC NULLS LAST, id DESC
           ) AS rn
    FROM "VerificationStage"
  ) t
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "VerificationStage_userId_stageName_key"
ON "VerificationStage" ("userId", "stageName");

-- One official submission per user per question
DELETE FROM "DsaSubmission"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "userId", "questionId"
             ORDER BY "submittedAt" DESC NULLS LAST, id DESC
           ) AS rn
    FROM "DsaSubmission"
    WHERE "isOfficial" = true
  ) t
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "DsaSubmission_user_question_official_key"
ON "DsaSubmission" ("userId", "questionId")
WHERE "isOfficial" = true;

-- One user answer per interview question index (prevents double-submit races)
DELETE FROM "InterviewMessage"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "interviewId", "questionIndex"
             ORDER BY "createdAt" ASC NULLS LAST, id ASC
           ) AS rn
    FROM "InterviewMessage"
    WHERE "sender" = 'user' AND "questionIndex" IS NOT NULL
  ) t
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterviewMessage_interview_user_qidx_key"
ON "InterviewMessage" ("interviewId", "questionIndex")
WHERE "sender" = 'user' AND "questionIndex" IS NOT NULL;
