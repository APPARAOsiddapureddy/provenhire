CREATE TABLE IF NOT EXISTS "TransactionalEmailLog" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,

  CONSTRAINT "TransactionalEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TransactionalEmailLog_eventKey_key"
ON "TransactionalEmailLog"("eventKey");

CREATE INDEX IF NOT EXISTS "TransactionalEmailLog_eventType_sentAt_idx"
ON "TransactionalEmailLog"("eventType", "sentAt");

CREATE INDEX IF NOT EXISTS "TransactionalEmailLog_recipient_idx"
ON "TransactionalEmailLog"("recipient");
