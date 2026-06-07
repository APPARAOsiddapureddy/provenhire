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

type UpgradeRequestResponse = {
  ok: boolean;
  notified_admin_count?: number;
};

const PLAN_CARDS: Array<{
  tier: SubscriptionTier;
  name: string;
  description: string;
  cta: string;
  features: string[];
}> = [
  {
    tier: "free",
    name: "Free",
    description: "Start hiring with basic access.",
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
    cta: "Request Starter",
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
    cta: "Request Growth",
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

export default function RecruiterPlansPage() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<RecruiterSubscription | null>(null);
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestingTier, setRequestingTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [subRes, profileRes] = await Promise.all([
          api.get<RecruiterSubscription>("/api/users/me/recruiter-subscription"),
          api.get<{ profile: RecruiterProfile | null }>("/api/users/recruiter-profile"),
        ]);
        if (!cancelled) {
          setSubscription(subRes);
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

  const requestUpgrade = async (tier: SubscriptionTier) => {
    setRequestingTier(tier);
    try {
      const result = await api.post<UpgradeRequestResponse>("/api/jobs/recruiter/upgrade-request", {
        message: `Recruiter requested ${tier} plan from Plans & Upgrade page.`,
      });
      const planName = tier === "starter" ? "Starter" : "Growth";
      if ((result.notified_admin_count ?? 0) > 0) {
        toast.success(`${planName} request sent to admin.`);
      } else {
        toast.warning(`${planName} request was not delivered because no admin account was found.`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not send upgrade request.");
    } finally {
      setRequestingTier(null);
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
            <p>Review recruiter plan limits and request a manual upgrade.</p>
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
                          disabled={isCurrent || requestingTier !== null}
                          onClick={() => requestUpgrade(plan.tier)}
                        >
                          {requestingTier === plan.tier ? "Sending..." : isCurrent ? "Current plan" : plan.cta}
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
