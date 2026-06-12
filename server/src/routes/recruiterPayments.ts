import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  activateRecruiterPayment,
  amountPaiseForRecruiterTier,
  createAdminPaymentNotification,
  PaidRecruiterTier,
  razorpayCreateOrder,
  recruiterTierLabel,
  RECRUITER_PAYMENT_CURRENCY,
  verifyRazorpayCheckoutSignature,
} from "../services/recruiterPlanPayment.service.js";
import {
  activePublishedJobLimit,
  contactLimit,
  jdInterviewMonthlyAllowance,
  normalizeSubscriptionTier,
  profileViewLimit,
} from "../utils/recruiterSubscription.js";

export const recruiterPaymentsRouter = Router();

const tierSchema = z.object({ tier: z.enum(["starter", "growth"]) });

async function getRecruiterOrResponse(req: AuthedRequest, res: any) {
  if (req.user!.role !== "recruiter") {
    res.status(403).json({ error: "Recruiter access required" });
    return null;
  }
  const recruiter = await prisma.recruiterProfile.findUnique({
    where: { userId: req.user!.id },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!recruiter) {
    res.status(403).json({ error: "Recruiter profile required" });
    return null;
  }
  return recruiter;
}

function publicPayment(payment: any) {
  if (!payment) return null;
  return {
    id: payment.id,
    tier: payment.tier,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    status: payment.status,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    periodStart: payment.periodStart?.toISOString?.() ?? payment.periodStart ?? null,
    periodEnd: payment.periodEnd?.toISOString?.() ?? payment.periodEnd ?? null,
    paidAt: payment.paidAt?.toISOString?.() ?? payment.paidAt ?? null,
    createdAt: payment.createdAt?.toISOString?.() ?? payment.createdAt ?? null,
  };
}

recruiterPaymentsRouter.get("/current", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const recruiter = await getRecruiterOrResponse(req, res);
    if (!recruiter) return;

    const [usage, latestPayment] = await Promise.all([
      prisma.recruiterUsage.findUnique({ where: { recruiterId: recruiter.id } }),
      prisma.recruiterPlanPayment.findFirst({
        where: { recruiterId: recruiter.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const tier = usage ? normalizeSubscriptionTier(usage) : "free";
    res.json({
      subscriptionTier: tier,
      limits: {
        activePublishedJobLimit: activePublishedJobLimit(tier),
        profileViewLimit: profileViewLimit(tier),
        contactLimit: contactLimit(tier),
        jdInterviewMonthlyAllowance: jdInterviewMonthlyAllowance(tier),
      },
      activePaidUntil: tier === "free" ? null : usage?.periodEnd?.toISOString() ?? null,
      latestPayment: publicPayment(latestPayment),
    });
  } catch (e) {
    console.error("[recruiter/payments/current]", e);
    res.status(500).json({ error: "Failed to load payment status" });
  }
});

recruiterPaymentsRouter.post("/create-order", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = tierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid tier" });

  try {
    const recruiter = await getRecruiterOrResponse(req, res);
    if (!recruiter) return;

    const tier = parsed.data.tier as PaidRecruiterTier;
    const amountPaise = amountPaiseForRecruiterTier(tier);
    const reusableSince = new Date(Date.now() - 30 * 60 * 1000);
    const existing = await prisma.recruiterPlanPayment.findFirst({
      where: {
        recruiterId: recruiter.id,
        tier,
        status: { in: ["created", "attempted"] },
        razorpayOrderId: { not: null },
        createdAt: { gte: reusableSince },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing?.razorpayOrderId) {
      return res.json({
        orderId: existing.razorpayOrderId,
        amount: existing.amountPaise,
        currency: existing.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        paymentRecordId: existing.id,
        tier,
        planName: recruiterTierLabel(tier),
      });
    }

    const payment = await prisma.recruiterPlanPayment.create({
      data: {
        recruiterId: recruiter.id,
        tier,
        amountPaise,
        currency: RECRUITER_PAYMENT_CURRENCY,
        status: "created",
      },
    });

    const order = await razorpayCreateOrder(
      amountPaise,
      `rp_${payment.id.replace(/-/g, "").slice(0, 28)}`,
      {
        product: "recruiter_plan",
        recruiterId: recruiter.id,
        tier,
      },
    );

    await prisma.recruiterPlanPayment.update({
      where: { id: payment.id },
      data: {
        razorpayOrderId: order.id,
        status: "attempted",
      },
    });

    res.json({
      orderId: order.id,
      amount: amountPaise,
      currency: RECRUITER_PAYMENT_CURRENCY,
      keyId: process.env.RAZORPAY_KEY_ID,
      paymentRecordId: payment.id,
      tier,
      planName: recruiterTierLabel(tier),
    });
  } catch (e) {
    console.error("[recruiter/payments/create-order]", e instanceof Error ? e.message : e);
    res.status(502).json({ error: e instanceof Error ? e.message : "Could not create payment order" });
  }
});

const verifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

recruiterPaymentsRouter.post("/verify", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { orderId, paymentId, signature } = parsed.data;

  try {
    const recruiter = await getRecruiterOrResponse(req, res);
    if (!recruiter) return;

    const payment = await prisma.recruiterPlanPayment.findFirst({
      where: { recruiterId: recruiter.id, razorpayOrderId: orderId },
    });
    if (!payment) return res.status(404).json({ error: "Payment order not found" });

    if (!verifyRazorpayCheckoutSignature(orderId, paymentId, signature)) {
      await prisma.recruiterPlanPayment.update({
        where: { id: payment.id },
        data: {
          status: "failed",
          failureReason: "Invalid Razorpay checkout signature",
        },
      });
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const updated = await prisma.$transaction((tx) =>
      activateRecruiterPayment(tx, payment, paymentId, signature),
    );
    void createAdminPaymentNotification(updated).catch(() => {});

    res.json({
      ok: true,
      subscriptionTier: updated.tier,
      paidUntil: updated.periodEnd?.toISOString() ?? null,
      payment: publicPayment(updated),
    });
  } catch (e) {
    console.error("[recruiter/payments/verify]", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Payment verification failed" });
  }
});
