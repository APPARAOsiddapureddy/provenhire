-- CreateTable (idempotent for resolve --rolled-back retry)
CREATE TABLE IF NOT EXISTS "AptitudeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answerKey" JSONB NOT NULL,
    "marksKey" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AptitudeSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AptitudeSession_userId_key" ON "AptitudeSession"("userId");

-- AddForeignKey only if missing (PostgreSQL: check constraint existence)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AptitudeSession_userId_fkey'
  ) THEN
    ALTER TABLE "AptitudeSession" ADD CONSTRAINT "AptitudeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
