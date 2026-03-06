-- CreateTable
CREATE TABLE "AptitudeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answerKey" JSONB NOT NULL,
    "marksKey" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AptitudeSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AptitudeSession_userId_key" ON "AptitudeSession"("userId");

-- AddForeignKey
ALTER TABLE "AptitudeSession" ADD CONSTRAINT "AptitudeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
