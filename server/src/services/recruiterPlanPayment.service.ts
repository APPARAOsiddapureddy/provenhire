import crypto from "crypto";
import type { Prisma, PrismaClient, RecruiterPlanPayment } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  RECRUITER_GROWTH_INR_MONTH,
  RECRUITER_STARTER_INR_MONTH,
} from "../constants/revenue.js";

export type PaidRecruiterTier = "starter" | "growth";

export const RECRUITER_PAYMENT_CURRENCY = "INR";

export function amountPaiseForRecruiterTier(tier: PaidRecruiterTier): number {
  const rupees = tier === "starter" ? RECRUITER_STARTER_INR_MONTH : RECRUITER_GROWTH_INR_MONTH;
  return rupees * 100;
}

export function recruiterTierLabel(tier: PaidRecruiterTier): string {
  return tier === "starter" ? "Starter" : "Growth";
}

export function addOneMonth(from: Date): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + 1);
  return end;
}

export async function razorpayCreateOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) {
    throw new Error("Razorpay is not configured");
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
      currency: RECRUITER_PAYMENT_CURRENCY,
      receipt: receipt.slice(0, 40),
      notes,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Razorpay order failed");
  }

  return response.json() as Promise<{ id: string; amount: number; currency: string; status?: string }>;
}

export function verifyRazorpayCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

type Tx = Prisma.TransactionClient | PrismaClient;

export async function activateRecruiterPayment(
  tx: Tx,
  payment: RecruiterPlanPayment,
  paymentId: string,
  signature?: string | null,
): Promise<RecruiterPlanPayment> {
  if (payment.status === "paid") {
    return payment;
  }

  const paidAt = new Date();
  const periodEnd = addOneMonth(paidAt);
  const updated = await tx.recruiterPlanPayment.update({
    where: { id: payment.id },
    data: {
      status: "paid",
      razorpayPaymentId: payment.razorpayPaymentId ?? paymentId,
      razorpaySignature: signature ?? payment.razorpaySignature,
      paidAt,
      periodStart: paidAt,
      periodEnd,
      failureReason: null,
    },
  });

  await tx.recruiterUsage.upsert({
    where: { recruiterId: payment.recruiterId },
    create: {
      recruiterId: payment.recruiterId,
      subscriptionTier: payment.tier,
      planType: "paid",
      periodEnd,
    },
    update: {
      subscriptionTier: payment.tier,
      planType: "paid",
      periodEnd,
    },
  });

  return updated;
}

export async function createAdminPaymentNotification(payment: RecruiterPlanPayment) {
  const recruiter = await prisma.recruiterProfile.findUnique({
    where: { id: payment.recruiterId },
    include: { user: { select: { email: true, name: true } } },
  });
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
  if (!admins.length) return 0;

  const who = recruiter?.workEmail || recruiter?.user?.email || recruiter?.fullName || recruiter?.user?.name || "Recruiter";
  const company = recruiter?.companyName ? ` (${recruiter.companyName})` : "";
  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Recruiter payment received",
      message: `${who}${company} paid for ${recruiterTierLabel(payment.tier as PaidRecruiterTier)}. Amount: ₹${Math.round(payment.amountPaise / 100)}. Razorpay payment: ${payment.razorpayPaymentId ?? "pending"}.`,
      targetRole: "admin",
    })),
  });
  return admins.length;
}
