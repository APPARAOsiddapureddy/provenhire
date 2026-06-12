import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  getHumanInterviewEligibility,
  HUMAN_INTERVIEW_PRICE_PAISE,
} from "../services/humanInterviewGate.service.js";
import {
  sendHumanInterviewPaymentFailedEmail,
  sendHumanInterviewPaymentConfirmedEmail,
} from "../services/resend.js";

export const humanInterviewRouter = Router();

humanInterviewRouter.get("/eligibility", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const eligibility = await getHumanInterviewEligibility(req.user!.id);
    res.json(eligibility);
  } catch (e) {
    console.error("[human-interview/eligibility]", e);
    res.status(500).json({ error: "Failed to load eligibility" });
  }
});

async function razorpayCreateOrder(amountPaise: number, receipt: string): Promise<{ id: string }> {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  }
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: receipt.slice(0, 40),
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Razorpay order failed");
  }
  return response.json() as Promise<{ id: string }>;
}

function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

/** Start payment: create Razorpay order and attach to attempt */
humanInterviewRouter.post("/payment/create-order", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const eligibility = await getHumanInterviewEligibility(req.user!.id);
    if (!eligibility.can_access_payment_page || !eligibility.attempt_id) {
      return res.status(403).json({ error: "Payment is not required or not available" });
    }

    const attempt = await prisma.humanInterviewAttempt.findFirst({
      where: {
        id: eligibility.attempt_id,
        candidateId: req.user!.id,
        paymentStatus: "pending",
      },
    });
    if (!attempt) return res.status(400).json({ error: "No payable attempt" });

    if (attempt.razorpayOrderId) {
      return res.json({
        orderId: attempt.razorpayOrderId,
        amount: HUMAN_INTERVIEW_PRICE_PAISE,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID,
        attemptId: attempt.id,
      });
    }

    const receipt = `hi_${attempt.id.replace(/-/g, "").slice(0, 28)}`;
    const order = await razorpayCreateOrder(HUMAN_INTERVIEW_PRICE_PAISE, receipt);
    await prisma.humanInterviewAttempt.update({
      where: { id: attempt.id },
      data: { razorpayOrderId: order.id },
    });

    res.json({
      orderId: order.id,
      amount: HUMAN_INTERVIEW_PRICE_PAISE,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      attemptId: attempt.id,
    });
  } catch (e) {
    console.error("[human-interview/payment/create-order]", e);
    res.status(502).json({ error: e instanceof Error ? e.message : "Order failed" });
  }
});

const verifyBodySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

humanInterviewRouter.post("/payment/verify", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = verifyBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { orderId, paymentId, signature } = parsed.data;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return res.status(503).json({ error: "Payment verification not configured" });

  if (!verifyRazorpaySignature(orderId, paymentId, signature, secret)) {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, name: true },
    });
    await prisma.humanInterviewAttempt.updateMany({
      where: { razorpayOrderId: orderId, candidateId: req.user!.id, paymentStatus: "pending" },
      data: { paymentStatus: "failed" },
    });
    if (user?.email) {
      void sendHumanInterviewPaymentFailedEmail(user.email, user.name).catch(() => {});
    }
    return res.status(400).json({ error: "Invalid payment signature" });
  }

  try {
    let shouldSendPaymentConfirmedEmail = false;
    await prisma.$transaction(async (tx) => {
      const att = await tx.humanInterviewAttempt.findFirst({
        where: { razorpayOrderId: orderId, candidateId: req.user!.id },
      });
      if (!att) {
        throw new Error("Attempt not found");
      }
      if (att.paymentStatus === "paid") {
        return;
      }
      if (att.paymentStatus !== "pending") {
        throw new Error("Payment not pending");
      }
      await tx.humanInterviewAttempt.update({
        where: { id: att.id },
        data: { paymentStatus: "paid", razorpayPaymentId: paymentId },
      });
      shouldSendPaymentConfirmedEmail = true;
      await tx.verificationStage.upsert({
        where: {
          userId_stageName: { userId: req.user!.id, stageName: "human_expert_interview" },
        },
        create: {
          userId: req.user!.id,
          stageName: "human_expert_interview",
          status: "in_progress",
        },
        update: { status: "in_progress" },
      });
    });
    if (shouldSendPaymentConfirmedEmail) {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { email: true, name: true },
      });
      if (user?.email) {
        void sendHumanInterviewPaymentConfirmedEmail({
          to: user.email,
          name: user.name,
          eventKey: `human-interview-payment-confirmed:${orderId}:${paymentId}`,
        }).catch((err) => {
          console.warn("[human-interview/payment/verify] confirmation email failed:", err instanceof Error ? err.message : err);
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[human-interview/payment/verify]", e);
    const msg = e instanceof Error ? e.message : "Verify failed";
    if (msg === "Attempt not found") {
      return res.status(404).json({ error: msg });
    }
    if (msg === "Payment not pending") {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

/** Explicit opt-in only — never enable in staging/production by default. */
const MOCK_ALLOWED = process.env.ALLOW_MOCK_HUMAN_INTERVIEW_PAYMENT === "true";

humanInterviewRouter.post("/payment/mock-success", requireAuth, async (req: AuthedRequest, res) => {
  if (!MOCK_ALLOWED) return res.status(403).json({ error: "Not allowed" });
  try {
    const eligibility = await getHumanInterviewEligibility(req.user!.id);
    const attemptId = eligibility.attempt_id;
    if (!eligibility.can_access_payment_page || !attemptId) {
      return res.status(403).json({ error: "Payment is not pending" });
    }
    await prisma.$transaction(async (tx) => {
      const att = await tx.humanInterviewAttempt.findFirst({
        where: { id: attemptId, candidateId: req.user!.id },
      });
      if (!att) throw new Error("No attempt");
      if (att.paymentStatus === "paid") {
        return;
      }
      if (att.paymentStatus !== "pending") {
        throw new Error("Payment not pending");
      }
      await tx.humanInterviewAttempt.update({
        where: { id: att.id },
        data: { paymentStatus: "paid", razorpayPaymentId: "mock_pay" },
      });
      await tx.verificationStage.upsert({
        where: {
          userId_stageName: { userId: req.user!.id, stageName: "human_expert_interview" },
        },
        create: {
          userId: req.user!.id,
          stageName: "human_expert_interview",
          status: "in_progress",
        },
        update: { status: "in_progress" },
      });
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("[human-interview/payment/mock-success]", e);
    res.status(400).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});
