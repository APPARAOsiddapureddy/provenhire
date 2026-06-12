import { Router } from "express";
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  activateRecruiterPayment,
  createAdminPaymentNotification,
  verifyRazorpayWebhookSignature,
} from "../services/recruiterPlanPayment.service.js";

export const razorpayWebhookRouter = Router();

function isKnownPrismaError(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === code;
}

function getRawBody(req: Request): Buffer | null {
  if (Buffer.isBuffer(req.body)) return req.body;
  return null;
}

async function processCapturedPayment(orderId: string | null, paymentId: string | null) {
  if (!orderId || !paymentId) return;
  const payment = await prisma.recruiterPlanPayment.findUnique({
    where: { razorpayOrderId: orderId },
  });
  if (!payment || payment.status === "paid") return;

  const updated = await prisma.$transaction((tx) =>
    activateRecruiterPayment(tx, payment, paymentId, payment.razorpaySignature),
  );
  void createAdminPaymentNotification(updated).catch(() => {});
}

async function processFailedPayment(orderId: string | null, paymentId: string | null, reason: string) {
  if (!orderId && !paymentId) return;
  await prisma.recruiterPlanPayment.updateMany({
    where: {
      OR: [
        ...(orderId ? [{ razorpayOrderId: orderId }] : []),
        ...(paymentId ? [{ razorpayPaymentId: paymentId }] : []),
      ],
      status: { not: "paid" },
    },
    data: {
      status: "failed",
      razorpayPaymentId: paymentId ?? undefined,
      failureReason: reason,
    },
  });
}

async function processRefund(paymentId: string | null) {
  if (!paymentId) return;
  await prisma.recruiterPlanPayment.updateMany({
    where: { razorpayPaymentId: paymentId },
    data: {
      status: "refunded",
      failureReason: "Razorpay refund webhook received. Review before changing recruiter access.",
    },
  });
}

razorpayWebhookRouter.post("/", async (req: Request, res: Response) => {
  const rawBody = getRawBody(req);
  const signatureHeader = req.headers["x-razorpay-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!rawBody || !verifyRazorpayWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  const eventIdHeader = req.headers["x-razorpay-event-id"];
  const eventId = Array.isArray(eventIdHeader) ? eventIdHeader[0] : eventIdHeader;
  const eventName = String(payload?.event ?? "unknown");
  const paymentEntity = payload?.payload?.payment?.entity;
  const refundEntity = payload?.payload?.refund?.entity;
  const orderId = paymentEntity?.order_id ? String(paymentEntity.order_id) : null;
  const paymentId = paymentEntity?.id ? String(paymentEntity.id) : refundEntity?.payment_id ? String(refundEntity.payment_id) : null;

  if (eventId) {
    try {
      await prisma.razorpayWebhookEvent.create({
        data: {
          eventId,
          eventName,
          paymentId,
          orderId,
        },
      });
    } catch (e) {
      if (isKnownPrismaError(e as Prisma.PrismaClientKnownRequestError, "P2002")) {
        return res.json({ ok: true, duplicate: true });
      }
      throw e;
    }
  }

  try {
    if (eventName === "payment.captured") {
      await processCapturedPayment(orderId, paymentId);
    } else if (eventName === "payment.failed") {
      const reason = String(paymentEntity?.error_description || paymentEntity?.error_reason || "Razorpay payment failed");
      await processFailedPayment(orderId, paymentId, reason);
    } else if (eventName.startsWith("refund.")) {
      await processRefund(paymentId);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[razorpay/webhook]", e);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
