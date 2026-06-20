import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api, BACKEND_DOWN_MSG } from "@/lib/api";
import DashboardShell from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Lock, Sparkles, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type TopSkill = { skill: string; confidence: number };

type RecRow = {
  profileId: string;
  userId: string;
  matchScore: number;
  certificationLevel: number;
  certificationLevelCode: string | null;
  locked: boolean;
  experienceLevelLabel: string;
  summary: {
    currentRole: string | null;
    experienceYears: number | null;
    topSkills: string[];
    topVerifiedSkills: TopSkill[];
    overallScore: number | null;
  };
};

type DiscoveryResponse = {
  jobTitle: string;
  matchCount: number;
  candidates: RecRow[];
  subscriptionTier?: string;
  limits?: { profileViewsUsed: number; profileViewsMonthly: number | null };
};

function CandidateDiscoverySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <Card key={item} className="overflow-hidden">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-10 w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function certPillClass(code: string | null, level: number): string {
  const c = code || "";
  if (c === "L3" || level >= 3) return "bg-emerald-500/15 text-emerald-200 border-emerald-500/40";
  if (c === "L2" || level === 2) return "bg-blue-500/15 text-blue-100 border-blue-500/40";
  if (c === "L1" || level === 1) return "bg-amber-500/20 text-amber-50 border-amber-500/45";
  return "bg-white/10 text-muted-foreground border-white/15";
}

export default function JobCandidateDiscovery() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DiscoveryResponse | null>(null);

  useEffect(() => {
    if (!user || user.role !== "recruiter" || !jobId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<DiscoveryResponse>(`/api/jobs/${jobId}/recommendations`);
        if (!cancelled) setData(res);
      } catch (e: unknown) {
        const err = e as Error & { status?: number };
        toast.error(err?.message || "Could not load recommendations");
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, jobId]);

  if (!user || user.role !== "recruiter") {
    return (
      <DashboardShell title="Matches" subtitle="Recruiter access required">
        <p className="text-muted-foreground">{BACKEND_DOWN_MSG}</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Matched candidates"
      subtitle={
        data
          ? `We found ${data.matchCount} matching verified candidate${data.matchCount === 1 ? "" : "s"} for ${data.jobTitle}`
          : "AI-ranked for your job"
      }
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard/recruiter">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
      }
    >
      {loading && (
        <CandidateDiscoverySkeleton />
      )}

      {!loading && data && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              Top 9 matches
            </Badge>
            {data.subscriptionTier === "free" && (
              <span>First 2 cards unlocked. Subscribe to reveal all profiles in the grid.</span>
            )}
            {data.limits?.profileViewsMonthly != null && (
              <span>
                Profile views this period: {data.limits.profileViewsUsed} / {data.limits.profileViewsMonthly}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.candidates.map((c) => (
              <Card
                key={c.profileId}
                className={`border overflow-hidden ${c.locked ? "opacity-95" : "border-primary/20"}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {c.locked ? (
                        <Badge variant="outline" className="text-xs gap-1 border-amber-500/50 text-amber-100">
                          <Lock className="h-3 w-3" />
                          Locked
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs gap-1 border-emerald-500/50 text-emerald-100">
                          Free
                        </Badge>
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${certPillClass(
                        c.certificationLevelCode,
                        c.certificationLevel
                      )}`}
                    >
                      <Award className="h-3 w-3" />
                      {c.certificationLevelCode ?? `L${c.certificationLevel}`}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="font-semibold text-foreground line-clamp-1">
                      {c.summary.currentRole || "Verified candidate"}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.experienceLevelLabel}</p>
                  </div>

                  <div className="pt-1 border-t border-border/60">
                    <p className="text-xs text-muted-foreground mb-1">Overall score</p>
                    <p className="text-lg font-bold tabular-nums">
                      {c.summary.overallScore != null ? `${c.summary.overallScore}` : "—"}
                      <span className="text-sm font-normal text-muted-foreground"> / 100</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Match {c.matchScore}%</p>
                  </div>

                  {c.locked ? (
                    <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/25 p-3 bg-muted/20">
                      <p className="text-xs font-medium text-muted-foreground">Top verified skills</p>
                      {[72, 58, 81].map((pct, i) => (
                        <div key={i} className="space-y-1 select-none">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="blur-[5px] text-foreground/80">███████</span>
                            <span className="blur-[3px] tabular-nums text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/35 blur-[2px]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-center text-muted-foreground pt-1">Subscribe to unlock full profile</p>
                    </div>
                  ) : c.summary.topVerifiedSkills.length > 0 ? (
                    <ul className="space-y-1.5">
                      {c.summary.topVerifiedSkills.slice(0, 3).map((s) => (
                        <li key={s.skill} className="text-sm">
                          <div className="flex justify-between gap-2">
                            <span>{s.skill}</span>
                            <span className="text-muted-foreground tabular-nums">{s.confidence}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted mt-0.5">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${s.confidence}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Verified skills will appear after skill interview.</p>
                  )}

                  {c.locked ? (
                    <Button className="w-full" variant="secondary" asChild>
                      <Link to="/dashboard/recruiter">Subscribe to unlock</Link>
                    </Button>
                  ) : (
                    <Button className="w-full" asChild>
                      <Link
                        to={`/candidate-search/${c.profileId}?jobId=${encodeURIComponent(jobId ?? "")}&match=${c.matchScore}`}
                      >
                        View full profile
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {data.candidates.length === 0 && (
            <p className="text-center text-muted-foreground py-12">
              No verified candidates match this job yet. Try lowering minimum certification or required skills.
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Load more (next 9) ships with paid tiers — coming next.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
