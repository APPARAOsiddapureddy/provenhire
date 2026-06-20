/**
 * Job-specific applicants page for recruiters.
 * Compact card design from ProvenHire mockup: cert strip, score rings,
 * hiring readiness, skills, proctoring status, View Full Profile.
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Star, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Applicant {
  application_id: string;
  recruiter_next_interview_mode?: string | null;
  recruiter_interview_path_set_at?: string | null;
  status: string;
  applied_at: string | null;
  resume_url: string | null;
  id: string;
  user_id: string;
  full_name?: string | null;
  current_role?: string | null;
  experience_years?: number | null;
  verification_status?: string | null;
  skills?: string[];
  location?: string | null;
  certification_level?: number;
  certification_label?: string;
  certificationLevel?: "L1" | "L2" | "L3" | null;
  certificationLabelShort?: string | null;
  aptitude_score?: number | null;
  dsa_score?: number | null;
  ai_interview_score?: number | null;
  human_expert_interview_score?: number | null;
  assignment_score?: number | null;
  integrity_score?: number | null;
  expected_salary?: string | null;
  hiring_readiness?: number;
  skill_freshness?: {
    aptitude?: { status: string; last_verified_days_ago: number | null } | null;
    live_coding?: { status: string; last_verified_days_ago: number | null } | null;
    interview?: { status: string; last_verified_days_ago: number | null } | null;
  };
}

function ApplicantsPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container space-y-6 py-6">
        <Skeleton className="h-5 w-72" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-8 w-80 max-w-full" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-44" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const CERT_STRIP_CLASS: Record<number, string> = {
  1: "bg-gradient-to-r from-sky-400 to-blue-400",
  2: "bg-gradient-to-r from-violet-400 to-purple-400",
  3: "bg-gradient-to-r from-amber-400 to-yellow-300",
};

const CERT_BADGE_CLASS: Record<number, string> = {
  1: "bg-sky-500/10 border-sky-500/30 text-sky-300",
  2: "bg-violet-500/10 border-violet-500/30 text-violet-300",
  3: "bg-amber-500/10 border-amber-500/30 text-amber-300",
};

const CERT_LABELS: Record<number, string> = {
  1: "✓ Verified",
  2: "⚡ Skill",
  3: "🏅 Elite",
};

type VerificationStageKey = "profile_only" | "aptitude_complete" | "dsa_complete" | "ai_interviewed" | "expert_verified";

const VERIFICATION_STAGE_META: Record<
  VerificationStageKey,
  { label: string; depth: number; badgeClass: string }
> = {
  profile_only: { label: "Profile Only", depth: 0, badgeClass: "bg-slate-500/10 border-slate-500/30 text-slate-300" },
  aptitude_complete: { label: "Cognitive Complete", depth: 1, badgeClass: "bg-amber-500/10 border-amber-500/30 text-amber-300" },
  dsa_complete: { label: "DSA Complete", depth: 2, badgeClass: "bg-sky-500/10 border-sky-500/30 text-sky-300" },
  ai_interviewed: { label: "AI Interviewed", depth: 3, badgeClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" },
  expert_verified: { label: "Expert Verified", depth: 4, badgeClass: "bg-violet-500/10 border-violet-500/30 text-violet-300" },
};

function getVerificationStageKey(a: Applicant): VerificationStageKey {
  if (a.human_expert_interview_score != null) return "expert_verified";
  if (a.ai_interview_score != null) return "ai_interviewed";
  if (a.dsa_score != null) return "dsa_complete";
  if (a.aptitude_score != null) return "aptitude_complete";
  return "profile_only";
}

function getVerificationStageMeta(a: Applicant) {
  return VERIFICATION_STAGE_META[getVerificationStageKey(a)];
}

function getHighestStageScore(a: Applicant) {
  return a.ai_interview_score ?? a.dsa_score ?? a.aptitude_score ?? 0;
}

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "??";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

function formatApplied(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

function ScoreRing({ value, color = "gold" }: { value: number | null | undefined; color?: "gold" | "green" }) {
  const v = value ?? 0;
  const pct = Math.min(100, Math.max(0, v));
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;
  const stroke = color === "green" ? "#2ecc8a" : "#f5c842";

  return (
    <div className="relative w-[46px] h-[46px] mx-auto mb-1">
      <svg width="46" height="46" viewBox="0 0 46 46" className="-rotate-90">
        <circle
          cx="23"
          cy="23"
          r="18"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="4"
        />
        <circle
          cx="23"
          cy="23"
          r="18"
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`text-[13px] font-extrabold ${color === "green" ? "text-emerald-400" : "text-white"}`}
        >
          {v}
        </span>
      </div>
    </div>
  );
}

const NEXT_INTERVIEW_OPTIONS: { value: string; label: string }[] = [
  { value: "provenhire_ai", label: "ProvenHire AI interview (JD / fit)" },
  { value: "human_expert", label: "ProvenHire Human Expert interview" },
  { value: "company_employee", label: "Our company / employee interview (off-platform)" },
];

const ApplicantsPage = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<{ id: string; title: string; company: string } | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [pathDraft, setPathDraft] = useState<Record<string, string>>({});
  const [savingPathId, setSavingPathId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "shortlisted" | "elite">("all");
  const [verificationStageFilter, setVerificationStageFilter] = useState<"all" | VerificationStageKey>("all");
  const [sortBy, setSortBy] = useState<"newest" | "highest_score" | "stage">("highest_score");

  const refetchApplicants = useCallback(async () => {
    if (!jobId) return;
    const r = await api.get<{ job: { id: string; title: string; company: string }; applicants: Applicant[] }>(
      `/api/jobs/${jobId}/applicants`
    );
    setJob(r.job);
    setApplicants(r.applicants || []);
    const drafts: Record<string, string> = {};
    for (const row of r.applicants || []) {
      if (row.recruiter_next_interview_mode) drafts[row.application_id] = row.recruiter_next_interview_mode;
    }
    setPathDraft((prev) => ({ ...drafts, ...prev }));
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    refetchApplicants()
      .catch(() => toast({ title: "Failed to load applicants", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [jobId, toast, refetchApplicants]);

  const saveInterviewPath = async (applicationId: string) => {
    const mode = pathDraft[applicationId];
    if (!mode) {
      toast({ title: "Choose a next interview option", variant: "destructive" });
      return;
    }
    setSavingPathId(applicationId);
    try {
      await api.patch(`/api/jobs/recruiter/applications/${applicationId}/next-interview`, { mode });
      toast({ title: "Next interview step saved for this candidate." });
      await refetchApplicants();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSavingPathId(null);
    }
  };

  const filtered = applicants.filter((a) => {
    const stageKey = getVerificationStageKey(a);

    const matchesStage = verificationStageFilter === "all" ? true : stageKey === verificationStageFilter;
    if (!matchesStage) return false;

    if (filter === "shortlisted") return ["reviewing", "interview_scheduled", "shortlisted", "hired"].includes(a.status);
    if (filter === "elite") return (a.certification_level ?? 0) >= 3;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.applied_at || 0).getTime() - new Date(a.applied_at || 0).getTime();
      case "highest_score":
        return getHighestStageScore(b) - getHighestStageScore(a);
      case "stage": {
        const depthDiff = getVerificationStageMeta(b).depth - getVerificationStageMeta(a).depth;
        if (depthDiff !== 0) return depthDiff;
        // Tiebreaker: newest applications first.
        return new Date(b.applied_at || 0).getTime() - new Date(a.applied_at || 0).getTime();
      }
      default:
        return 0;
    }
  });

  const stats = {
    total: applicants.length,
    verified: applicants.filter((a) => a.verification_status === "verified").length,
    avgCoding: (() => {
      const withScore = applicants.filter((a) => a.dsa_score != null);
      return withScore.length
        ? Math.round(withScore.reduce((s, a) => s + (a.dsa_score ?? 0), 0) / withScore.length)
        : 0;
    })(),
    avgReadiness: applicants.length
      ? Math.round(
          applicants.reduce((s, a) => s + (a.hiring_readiness ?? 0), 0) / applicants.length
        )
      : 0,
    elite: applicants.filter((a) => (a.certification_level ?? 0) >= 3).length,
  };

  if (loading) {
    return <ApplicantsPageSkeleton />;
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          <p className="text-muted-foreground mb-4">Job not found</p>
          <Button variant="outline" onClick={() => navigate("/dashboard/recruiter")}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <button
            onClick={() => navigate("/dashboard/recruiter")}
            className="text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">Jobs</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-primary font-semibold">{job.title}</span>
        </div>

        {/* Page header */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              Applicants for{" "}
              <span className="text-primary">{job.title}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>{stats.total}</strong> candidates applied · <strong>{stats.verified}</strong> fully verified
              {stats.elite > 0 && (
                <>
                  {" "}
                  · <strong className="text-violet-400">{stats.elite}</strong> Elite
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {[
              { key: "all" as const, label: `All (${stats.total})` },
              { key: "shortlisted" as const, label: `Shortlisted` },
              { key: "elite" as const, label: `Elite ✦ (${stats.elite})` },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  filter === f.key
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="ml-2 px-3 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-foreground focus:outline-none focus:border-primary/30"
            >
              <option value="newest">Sort: Newest</option>
              <option value="highest_score">Sort: Highest Score</option>
              <option value="stage">Sort: Stage</option>
            </select>
          </div>
        </div>

        {/* Verification stage filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "all" as const, label: "All" },
                { key: "profile_only" as const, label: "Profile Only" },
                { key: "aptitude_complete" as const, label: "Cognitive Complete" },
                { key: "dsa_complete" as const, label: "DSA Complete" },
                { key: "ai_interviewed" as const, label: "AI Interviewed" },
                { key: "expert_verified" as const, label: "Expert Verified" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setVerificationStageFilter(f.key as any)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  verificationStageFilter === f.key
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 mb-6">
          {[
            { label: "Total Applicants", value: stats.total, sub: "" },
            { label: "Fully Verified", value: stats.verified, sub: "All assessments done", green: true },
            { label: "Avg Coding Score", value: stats.avgCoding, sub: "Out of 100" },
            { label: "Avg Readiness", value: `${stats.avgReadiness}%`, sub: "Hiring readiness" },
            { label: "Elite Verified", value: stats.elite, sub: "Level 3 candidates", purple: true },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/80 border border-border backdrop-blur"
            >
              <div
                className={`text-xl font-bold ${s.green ? "text-emerald-400" : s.purple ? "text-violet-400" : "text-primary"}`}
              >
                {s.value}
              </div>
              <div>
                <div className="text-[11px] font-medium text-muted-foreground uppercase">{s.label}</div>
                {s.sub && <div className="text-[10px] text-muted-foreground/80">{s.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Cards grid */}
        {sorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-xl">
            <p className="text-muted-foreground">No applicants match the current filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((a, idx) => {
              const lvl = Math.min(3, Math.max(0, a.certification_level ?? 0));
              const certText =
                a.certificationLabelShort?.trim() ||
                (a.certification_label && a.certification_label.trim()) ||
                CERT_LABELS[lvl] ||
                CERT_LABELS[0];
              const stageMeta = getVerificationStageMeta(a);
              return (
                <div
                  key={a.application_id}
                  className="group rounded-xl border border-border bg-card/80 backdrop-blur overflow-hidden transition-all hover:border-primary/20 hover:-translate-y-0.5 hover:shadow-lg animate-in fade-in"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className={`h-0.5 ${CERT_STRIP_CLASS[lvl] ?? CERT_STRIP_CLASS[0]}`} />
                  <div className="p-4 border-b border-white/5">
                    <div className="flex gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center text-primary font-bold shrink-0">
                        {getInitials(a.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{a.full_name || "Applicant"}</div>
                        <div className="text-sm text-primary font-medium">{a.current_role || "—"}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {a.location && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
                              📍 {a.location}
                            </span>
                          )}
                          {a.experience_years != null && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
                              {a.experience_years} yrs
                            </span>
                          )}
                          {a.expected_salary && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
                              {a.expected_salary}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge className={CERT_BADGE_CLASS[lvl] ?? CERT_BADGE_CLASS[0]}>
                          {a.certificationLevel ? `${a.certificationLevel} · ` : ""}
                          {certText}
                        </Badge>
                        <Badge variant="outline" className={stageMeta.badgeClass}>
                          {stageMeta.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{formatApplied(a.applied_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 border-b border-white/5">
                    {[
                      { label: "Cognitive", val: a.aptitude_score },
                      { label: "DSA", val: a.dsa_score },
                      { label: "AI Interview", val: a.ai_interview_score },
                      ...(a.human_expert_interview_score != null ? [{ label: "Expert", val: a.human_expert_interview_score }] : []),
                      ...(a.assignment_score != null ? [{ label: "Assignment", val: a.assignment_score }] : []),
                      { label: "Integrity", val: a.integrity_score },
                    ].map(({ label, val }) => (
                      <div key={label} className="text-center">
                        <ScoreRing
                          value={val}
                          color={label === "Integrity" && (val ?? 0) >= 85 ? "green" : "gold"}
                        />
                        <div className="text-[9px] text-muted-foreground uppercase font-semibold">{label}</div>
                      </div>
                    ))}
                  </div>

                  {a.skill_freshness && (a.skill_freshness.aptitude || a.skill_freshness.live_coding || a.skill_freshness.interview) && (
                    <div className="px-4 py-2 border-b border-white/5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      {a.skill_freshness.aptitude && (
                        <span>
                          Cognitive: {a.skill_freshness.aptitude.status === "EXPIRED"
                            ? "Expired"
                            : `${a.skill_freshness.aptitude.last_verified_days_ago ?? 0} days ago`}
                        </span>
                      )}
                      {a.skill_freshness.live_coding && (
                        <span>
                          Live Coding: {a.skill_freshness.live_coding.status === "EXPIRED"
                            ? "Expired"
                            : `${a.skill_freshness.live_coding.last_verified_days_ago ?? 0} days ago`}
                        </span>
                      )}
                      {a.skill_freshness.interview && (
                        <span>
                          Interview: {a.skill_freshness.interview.status === "EXPIRED"
                            ? "Expired"
                            : `${a.skill_freshness.interview.last_verified_days_ago ?? 0} days ago`}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="px-4 py-2 border-b border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                        Hiring Readiness
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {(a.hiring_readiness ?? 0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500"
                        style={{ width: `${a.hiring_readiness ?? 0}%` }}
                      />
                    </div>
                  </div>

                  {a.skills && a.skills.length > 0 && (
                    <div className="px-4 py-2 border-b border-white/5 flex flex-wrap gap-1">
                      {a.skills.slice(0, 5).map((s, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Proctoring Passed
                    </div>
                    <span className="text-[10px] text-muted-foreground">0 violations</span>
                  </div>

                  {a.ai_interview_score != null && job && (
                    <div className="px-4 py-3 border-t border-white/5 space-y-2 bg-muted/20">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        After AI Expert — next round (your decision)
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Choose how this candidate continues for <span className="text-foreground font-medium">{job.title}</span>. This
                        replaces a platform-default path: Human Expert only unlocks when you select it.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center pt-1">
                        <select
                          className="flex-1 text-sm rounded-md bg-background border border-border px-3 py-2 text-foreground"
                          value={pathDraft[a.application_id] ?? a.recruiter_next_interview_mode ?? ""}
                          onChange={(e) =>
                            setPathDraft((p) => ({
                              ...p,
                              [a.application_id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select next interview…</option>
                          {NEXT_INTERVIEW_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          className="shrink-0"
                          disabled={savingPathId === a.application_id}
                          onClick={() => void saveInterviewPath(a.application_id)}
                        >
                          {savingPathId === a.application_id ? "Saving…" : "Save choice"}
                        </Button>
                      </div>
                      {a.recruiter_interview_path_set_at && (
                        <p className="text-[10px] text-muted-foreground">
                          Last saved {new Date(a.recruiter_interview_path_set_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="p-4 flex items-center gap-2">
                    <Button
                      className="flex-1 bg-primary text-primary-foreground hover:opacity-90 font-bold"
                      size="sm"
                      onClick={() => navigate(`/candidate-search/${a.id}`)}
                    >
                      View Full Profile →
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      title="Shortlist"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-8 w-8"
                      title="Schedule Interview"
                    >
                      <Calendar className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default ApplicantsPage;
