CREATE TABLE "RecruiterPlanPayment" (
  "id" TEXT NOT NULL,
  "recruiterId" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'created',
  "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT,
  "razorpaySignature" TEXT,
  "failureReason" TEXT,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecruiterPlanPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RazorpayWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paymentId" TEXT,
  "orderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'processed',

  CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruiterPlanPayment_razorpayOrderId_key" ON "RecruiterPlanPayment"("razorpayOrderId");
CREATE UNIQUE INDEX "RecruiterPlanPayment_razorpayPaymentId_key" ON "RecruiterPlanPayment"("razorpayPaymentId");
CREATE INDEX "RecruiterPlanPayment_recruiterId_createdAt_idx" ON "RecruiterPlanPayment"("recruiterId", "createdAt");
CREATE INDEX "RecruiterPlanPayment_status_idx" ON "RecruiterPlanPayment"("status");
CREATE UNIQUE INDEX "RazorpayWebhookEvent_eventId_key" ON "RazorpayWebhookEvent"("eventId");
CREATE INDEX "RazorpayWebhookEvent_processedAt_idx" ON "RazorpayWebhookEvent"("processedAt");

ALTER TABLE "RecruiterPlanPayment"
  ADD CONSTRAINT "RecruiterPlanPayment_recruiterId_fkey"
  FOREIGN KEY ("recruiterId") REFERENCES "RecruiterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
