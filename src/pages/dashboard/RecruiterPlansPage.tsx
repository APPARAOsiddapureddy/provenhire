import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, CheckCircle2, CreditCard, LayoutGrid, Loader2, Search, Settings, Sparkles, Users } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

type SubscriptionTier = "free" | "starter" | "growth";

type RecruiterSubscription = {
  subscriptionTier: SubscriptionTier;
  limits: {
    activePublishedJobLimit: number;
    profileViewLimit: number;
    contactLimit: number;
    jdInterviewMonthlyAllowance: number;
  };
  used: {
    profileViewCountMonth: number;
    contactCountMonth: number;
    jdInterviewCountMonth: number;
    shortlistCountMonth: number;
    activeJobCount: number;
  };
  periodStart: string;
};

type RecruiterProfile = {
  full_name?: string | null;
  fullName?: string | null;
  company_name?: string | null;
  companyName?: string | null;
};

type RecruiterPayment = {
  id: string;
  tier: SubscriptionTier;
  amountPaise: number;
  currency: string;
  status: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};

type RecruiterPaymentCurrent = {
  subscriptionTier: SubscriptionTier;
  activePaidUntil: string | null;
  latestPayment: RecruiterPayment | null;
};

type RecruiterPaymentOrder = {
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string | null;
  paymentRecordId: string;
  tier: SubscriptionTier;
  planName: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

const PLAN_CARDS: Array<{
  tier: SubscriptionTier;
  name: string;
  description: string;
  price: string;
  cta: string;
  features: string[];
}> = [
  {
    tier: "free",
    name: "Free",
    description: "Start hiring with basic access.",
    price: "₹0",
    cta: "Current free plan",
    features: [
      "2 active job listings",
      "5 full profile views/month",
      "0 Express Interest sends",
      "0 JD AI interviews",
    ],
  },
  {
    tier: "starter",
    name: "Starter",
    description: "For small teams actively shortlisting.",
    price: "₹2,999 / month",
    cta: "Pay ₹2,999",
    features: [
      "5 active job listings",
      "50 full profile views/month",
      "10 Express Interest sends/month",
      "5 JD AI interviews/month",
    ],
  },
  {
    tier: "growth",
    name: "Growth",
    description: "For teams that need deeper hiring workflows.",
    price: "₹7,999 / month",
    cta: "Pay ₹7,999",
    features: [
      "Unlimited active job listings",
      "Unlimited full profile views",
      "30 Express Interest sends/month",
      "10 JD AI interviews/month",
      "Hiring analytics",
    ],
  },
];

function formatLimit(value: number): string {
  return value >= Number.MAX_SAFE_INTEGER ? "Unlimited" : String(value);
}

function usagePercent(used: number, limit: number): number {
  if (limit >= Number.MAX_SAFE_INTEGER) return 0;
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function formatPaymentAmount(amountPaise: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountPaise / 100);
}

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function paymentBadgeClass(status: string): string {
  if (status === "paid") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (status === "failed" || status === "refunded") return "bg-red-500/15 text-red-200 border-red-500/30";
  return "bg-amber-500/15 text-amber-200 border-amber-500/30";
}

export default function RecruiterPlansPage() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<RecruiterSubscription | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<RecruiterPaymentCurrent | null>(null);
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingTier, setPayingTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [subRes, paymentRes, profileRes] = await Promise.all([
          api.get<RecruiterSubscription>("/api/users/me/recruiter-subscription"),
          api.get<RecruiterPaymentCurrent>("/api/recruiter/payments/current"),
          api.get<{ profile: RecruiterProfile | null }>("/api/users/recruiter-profile"),
        ]);
        if (!cancelled) {
          setSubscription(subRes);
          setPaymentStatus(paymentRes);
          setProfile(profileRes.profile);
        }
      } catch (error: any) {
        toast.error(error?.message || "Could not load recruiter plan details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sidebarSections = useMemo(
    () => [
      {
        sectionLabel: "Recruiter",
        items: [
          { label: "Talent Pool", to: "/dashboard/recruiter", active: false, icon: <Users className="w-[18px] h-[18px]" /> },
          { label: "Search Candidates", to: "/candidate-search", icon: <Search className="w-[18px] h-[18px]" /> },
          { label: "My Jobs", to: "/dashboard/recruiter", active: false, icon: <Briefcase className="w-[18px] h-[18px]" /> },
          { label: "Pipeline & Tracking", to: "/dashboard/recruiter", active: false, icon: <LayoutGrid className="w-[18px] h-[18px]" /> },
          { label: "Plans & Upgrade", to: "/dashboard/recruiter/plans", active: true, icon: <CreditCard className="w-[18px] h-[18px]" /> },
          { label: "Settings", to: "/dashboard/settings", icon: <Settings className="w-[18px] h-[18px]" /> },
        ],
      },
    ],
    []
  );

  const userName = profile?.full_name || profile?.fullName || user?.email || "Recruiter";
  const userRole = profile?.company_name || profile?.companyName || "Recruiter";
  const userInitials = userName.toString().split(/\s|@/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  const refreshPlanDetails = async () => {
    const [subRes, paymentRes] = await Promise.all([
      api.get<RecruiterSubscription>("/api/users/me/recruiter-subscription"),
      api.get<RecruiterPaymentCurrent>("/api/recruiter/payments/current"),
    ]);
    setSubscription(subRes);
    setPaymentStatus(paymentRes);
  };

  const startPayment = async (tier: SubscriptionTier) => {
    if (tier === "free") return;
    setPayingTier(tier);
    try {
      const order = await api.post<RecruiterPaymentOrder>("/api/recruiter/payments/create-order", { tier });
      if (!order.keyId) {
        toast.error("Payment gateway is not configured.");
        setPayingTier(null);
        return;
      }
      await loadRazorpayScript();
      const Razorpay = window.Razorpay;
      if (!Razorpay) {
        toast.error("Could not load Razorpay checkout.");
        setPayingTier(null);
        return;
      }

      const checkout = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "ProvenHire",
        description: `${order.planName} recruiter plan`,
        prefill: {
          name: userName,
          email: user?.email,
        },
        notes: {
          product: "recruiter_plan",
          tier,
        },
        theme: {
          color: "#e5bd2e",
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await api.post("/api/recruiter/payments/verify", {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            await refreshPlanDetails();
            toast.success(`${order.planName} plan activated.`);
          } catch (error: any) {
            toast.error(error?.message || "Payment succeeded, but verification is pending. Please refresh in a moment.");
          } finally {
            setPayingTier(null);
          }
        },
        modal: {
          ondismiss: () => {
            setPayingTier(null);
            toast.message("Payment cancelled. Your plan was not changed.");
          },
        },
      });
      checkout.open();
    } catch (error: any) {
      setPayingTier(null);
      toast.error(error?.message || "Could not start payment.");
    }
  };

  return (
    <div className="min-h-screen">
      <DashboardShell
        sidebarSections={sidebarSections}
        user={{ name: userName, role: userRole, initials: userInitials }}
      >
        <div className="dashboard-section-header flex-wrap gap-4">
          <div>
            <h1>Plans & Upgrade</h1>
            <p>Review recruiter plan limits and pay securely with Razorpay.</p>
          </div>
          <Button className="dashboard-btn-ghost" asChild>
            <Link to="/dashboard/recruiter">Back to dashboard</Link>
          </Button>
        </div>

        {loading ? (
          <div className="dashboard-section-content flex items-center gap-3 text-[var(--dash-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading plan details...
          </div>
        ) : (
          <div className="dashboard-section-content space-y-6">
            {subscription && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Current plan
                  </CardTitle>
                  <CardDescription>
                    Your current tier is <span className="font-semibold text-foreground capitalize">{subscription.subscriptionTier}</span>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Active jobs", subscription.used.activeJobCount, subscription.limits.activePublishedJobLimit],
                    ["Profile views", subscription.used.profileViewCountMonth, subscription.limits.profileViewLimit],
                    ["Express Interest", subscription.used.contactCountMonth, subscription.limits.contactLimit],
                    ["JD AI interviews", subscription.used.jdInterviewCountMonth, subscription.limits.jdInterviewMonthlyAllowance],
                  ].map(([label, used, limit]) => {
                    const usedNum = Number(used);
                    const limitNum = Number(limit);
                    return (
                      <div key={String(label)} className="rounded-lg border border-[var(--dash-navy-border)] bg-white/5 p-4">
                        <p className="text-sm text-[var(--dash-text-muted)]">{label}</p>
                        <p className="mt-1 text-2xl font-semibold text-white">
                          {usedNum} / {formatLimit(limitNum)}
                        </p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[var(--dash-gold)]"
                            style={{ width: `${usagePercent(usedNum, limitNum)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {paymentStatus?.latestPayment && (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        Latest payment
                      </CardTitle>
                      <CardDescription>
                        {paymentStatus.latestPayment.status === "paid"
                          ? `Access active until ${formatDate(paymentStatus.latestPayment.periodEnd)}.`
                          : "Use this status when retrying payment or contacting support."}
                      </CardDescription>
                    </div>
                    <Badge className={paymentBadgeClass(paymentStatus.latestPayment.status)}>
                      {paymentStatus.latestPayment.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-[var(--dash-text-muted)]">Plan</p>
                    <p className="font-semibold capitalize text-white">{paymentStatus.latestPayment.tier}</p>
                  </div>
                  <div>
                    <p className="text-[var(--dash-text-muted)]">Amount</p>
                    <p className="font-semibold text-white">
                      {formatPaymentAmount(paymentStatus.latestPayment.amountPaise, paymentStatus.latestPayment.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--dash-text-muted)]">Order</p>
                    <p className="truncate font-mono text-xs text-white">
                      {paymentStatus.latestPayment.razorpayOrderId ?? "Not created"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--dash-text-muted)]">Paid</p>
                    <p className="font-semibold text-white">{formatDate(paymentStatus.latestPayment.paidAt)}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              {PLAN_CARDS.map((plan) => {
                const isCurrent = subscription?.subscriptionTier === plan.tier;
                const isPaid = plan.tier !== "free";
                return (
                  <Card key={plan.tier} className={isCurrent ? "border-primary/60" : ""}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>{plan.name}</CardTitle>
                        {isCurrent && (
                          <Badge className="bg-primary/15 text-primary border-primary/30">Current</Badge>
                        )}
                      </div>
                      <CardDescription>{plan.description}</CardDescription>
                      <div className="pt-2 text-2xl font-semibold text-white">{plan.price}</div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm text-[var(--dash-text-muted)]">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      {isPaid ? (
                        <Button
                          className="dashboard-btn-gold w-full"
                          disabled={isCurrent || payingTier !== null}
                          onClick={() => startPayment(plan.tier)}
                        >
                          {payingTier === plan.tier ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Opening checkout
                            </span>
                          ) : isCurrent ? (
                            "Current plan"
                          ) : (
                            plan.cta
                          )}
                        </Button>
                      ) : (
                        <Button className="dashboard-btn-ghost w-full" disabled>
                          {isCurrent ? "Current plan" : plan.cta}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </DashboardShell>
    </div>
  );
}
