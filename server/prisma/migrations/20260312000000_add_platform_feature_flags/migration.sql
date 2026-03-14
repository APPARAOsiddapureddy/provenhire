-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "PlatformFeatureFlag" (
    "id" TEXT NOT NULL,
    "featureName" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'OFF',
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformFeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformFeatureFlag_featureName_key" ON "PlatformFeatureFlag"("featureName");
