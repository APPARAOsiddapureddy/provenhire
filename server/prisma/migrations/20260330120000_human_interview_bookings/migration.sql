-- Canonical bookings for the Human Expert Interview (PRD: human_interview_bookings)
CREATE TABLE "human_interview_bookings" (
  "booking_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "slot_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "payment_status" TEXT NOT NULL,
  "human_interview_attempt_id" TEXT,
  "human_interview_session_id" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "human_interview_bookings_pkey" PRIMARY KEY ("booking_id")
);

CREATE INDEX "human_interview_bookings_candidateId_createdAt_idx"
  ON "human_interview_bookings"("candidate_id", "createdAt");

ALTER TABLE "human_interview_bookings"
  ADD CONSTRAINT "human_interview_bookings_candidateId_fkey"
  FOREIGN KEY ("candidate_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "human_interview_bookings"
  ADD CONSTRAINT "human_interview_bookings_slotId_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "InterviewerSlot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "human_interview_bookings"
  ADD CONSTRAINT "human_interview_bookings_human_interview_attempt_id_fkey"
  FOREIGN KEY ("human_interview_attempt_id") REFERENCES "HumanInterviewAttempt"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "human_interview_bookings"
  ADD CONSTRAINT "human_interview_bookings_human_interview_session_id_fkey"
  FOREIGN KEY ("human_interview_session_id") REFERENCES "HumanInterviewSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;