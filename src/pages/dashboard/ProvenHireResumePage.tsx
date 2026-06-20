import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Award,
  CheckCircle,
  ClipboardCopy,
  ExternalLink,
  Lock,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { jobSeekerShellUser } from "@/utils/jobSeekerIdentity";
import { buildJobSeekerSidebarSections, type JobSeekerDashboardSection } from "@/utils/jobSeekerSidebar";
import { Skeleton } from "@/components/ui/skeleton";

interface VerifiedSkill {
  skill: string;
  confidence: number;
  verifiedAt: string | null;
  expiresAt: string | null;
}

interface ClaimedSkill {
  skill: string;
  source?: string;
}

interface Project {
  name: string;
  role?: string;
  problemSolved?: string;
  techStack?: string[];
  keyDecisions?: string;
  outcome?: string;
  interviewId?: string;
  pendingReview?: boolean;
}

interface ResumeData {
  certificationLevel: string;
  certificationDate: string | null;
  roleType?: string | null;
  verifiedSkills: VerifiedSkill[];
  claimedSkills: ClaimedSkill[];
  projects: Project[];
  assessmentScores: Record<string, unknown>;
  shareableHandle: string;
  shareableProfileUrl: string;
  pendingCandidateReview: boolean;
  identity: {
    name: string | null;
    currentOrTargetRole: string | null;
    experienceLevel: string;
  };
  professionalBackground: {
    workExperience: unknown;
    education: unknown;
    disclaimer: string;
  };
}

const CERT_BADGE: Record<
  string,
  { className: string; short: string; label: string }
> = {
  L0: {
    className: "bg-muted text-muted-foreground border border-border",
    short: "L0",
    label: "Not Certified",
  },
  L1: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-100 border border-blue-200/60",
    short: "L1",
    label: "Cognitive Verified",
  },
  L2: {
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-100 border border-green-200/60",
    short: "L2",
    label: "Skill Passport",
  },
  L3: {
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100 border border-amber-300/80",
    short: "L3",
    label: "Elite Verified",
  },
};

function ProvenHireResumeSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="rounded-xl border border-[var(--dash-navy-border)] bg-white/[0.03] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-11 w-40 rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr_.9fr]">
        <div className="rounded-xl border border-[var(--dash-navy-border)] bg-white/[0.03] p-6">
          <Skeleton className="mx-auto mb-5 h-24 w-24 rounded-full" />
          <Skeleton className="mx-auto mb-3 h-6 w-40" />
          <Skeleton className="mx-auto mb-8 h-4 w-28" />
          <Skeleton className="mb-4 h-20 w-full rounded-lg" />
          <Skeleton className="mb-3 h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function confidenceBarColor(c: number): string {
  if (c >= 80) return "#22c55e";
  if (c >= 65) return "#eab308";
  if (c >= 50) return "#f97316";
  return "#ef4444";
}

function formatMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

type ScoreRow = {
  score: number | null;
  status: string | null;
  monthYear: string | null;
  label?: string | null;
  badgeLevel?: string | null;
};

export default function ProvenHireResumePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .get<{ resume: ResumeData }>("/api/users/me/provenhire-resume")
      .then((res) => setResume(res.resume))
      .catch(() => toast.error("Could not load your resume."))
      .finally(() => setLoading(false));
  }, [user]);

  const copyLink = () => {
    if (!resume?.shareableProfileUrl) return;
    navigator.clipboard.writeText(resume.shareableProfileUrl);
    toast.success("Copied!");
  };

  const handleApproveProject = async (projectKey: string) => {
    setApprovingId(projectKey);
    try {
      await api.post(`/api/users/me/provenhire-resume/project/${encodeURIComponent(projectKey)}/approve`);
      toast.success("Project approved and now visible to recruiters");
      const res = await api.get<{ resume: ResumeData }>("/api/users/me/provenhire-resume");
      setResume(res.resume);
    } catch {
      toast.error("Failed to approve project.");
    } finally {
      setApprovingId(null);
    }
  };

  const handleSubmitCorrection = async () => {
    if (correctionNote.trim().length < 5) {
      toast.error("Please describe the correction needed.");
      return;
    }
    setSubmittingCorrection(true);
    try {
      await api.post("/api/users/me/provenhire-resume/change-request", {
        section: "projects",
        note: correctionNote.trim(),
      });
      toast.success("Correction request sent. Admin will review within 24 hours.");
      setCorrectionOpen(false);
      setCorrectionNote("");
    } catch {
      toast.error("Failed to send correction request.");
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const profileLike = resume?.identity?.name ? { fullName: resume.identity.name } : null;
  const { name: shellDisplayName, initials } = user
    ? jobSeekerShellUser(profileLike, user)
    : { name: "Candidate", initials: "U" };

  const openDashboardSection = (section: JobSeekerDashboardSection) => {
    navigate("/dashboard/jobseeker", { state: { section } });
  };
  const sidebarSections = buildJobSeekerSidebarSections({
    activeItem: "resume",
    isVerified: resume ? resume.certificationLevel !== "L0" : false,
    onDashboardSection: openDashboardSection,
  });

  const shellUser = { name: shellDisplayName, role: "Job Seeker", initials };

  if (loading) {
    return (
      <DashboardShell sidebarSections={sidebarSections} user={shellUser}>
        <ProvenHireResumeSkeleton />
      </DashboardShell>
    );
  }

  if (!resume) {
    return (
      <DashboardShell sidebarSections={sidebarSections} user={shellUser}>
        <div className="max-w-3xl mx-auto py-10 text-center space-y-4">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Resume not yet available</h2>
          <p className="text-muted-foreground">
            Complete your verification pipeline to generate your ProvenHire Resume.
          </p>
          <Button variant="outline" onClick={() => openDashboardSection("resume")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            My Resume
          </Button>
        </div>
      </DashboardShell>
    );
  }

  const cert = CERT_BADGE[resume.certificationLevel] ?? CERT_BADGE.L0;
  const scores = (resume.assessmentScores ?? {}) as Record<string, unknown>;
  const expertRow = scores.aiExpert as ScoreRow | undefined;
  const expertCompleted = expertRow?.status === "completed";

  const scoreEntries = (["dsa", "aiSkills", "systemDesign", "aiExpert"] as const)
    .map((key) => {
      const v = scores[key] as ScoreRow | undefined;
      return [key, v] as const;
    })
    .filter(([, v]) => v?.status === "completed" && v?.score != null && v.score > 0);

  const hasAssessmentBlock =
    typeof scores.overall === "number" ||
    scoreEntries.length > 0;

  const rawWork = resume.professionalBackground?.workExperience;
  const workList = Array.isArray(rawWork) ? (rawWork as Array<Record<string, unknown>>) : [];

  return (
    <DashboardShell sidebarSections={sidebarSections} user={shellUser}>
      <div className="max-w-3xl mx-auto py-6 space-y-8">
        <Button variant="ghost" size="sm" onClick={() => openDashboardSection("resume")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          My Resume
        </Button>

        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-bold">ProvenHire Resume</h1>
                  <Badge className={cert.className}>
                    {cert.short} — {cert.label}
                  </Badge>
                </div>
                {resume.identity?.name && (
                  <p className="text-muted-foreground">
                    {resume.identity.name}
                    {resume.identity.currentOrTargetRole && ` · ${resume.identity.currentOrTargetRole}`}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {resume.certificationLevel !== "L0" && resume.certificationDate
                    ? `Verified ${formatMonth(resume.certificationDate)}`
                    : "In Progress"}
                </p>
              </div>
              {resume.shareableProfileUrl && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={copyLink}>
                    <ClipboardCopy className="h-4 w-4 mr-1" />
                    Copy Link
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => window.open(resume.shareableProfileUrl!, "_blank")}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {resume.shareableProfileUrl && (
              <p className="text-xs text-muted-foreground mt-2 font-mono break-all">{resume.shareableProfileUrl}</p>
            )}
          </CardContent>
        </Card>

        {/* Verified Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Verified Skills
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {resume.verifiedSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Complete the AI Skills Interview to unlock your verified skill badges.
              </p>
            ) : (
              resume.verifiedSkills.map((s) => (
                <div key={s.skill} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{s.skill}</span>
                    <span className="text-sm font-semibold tabular-nums">{Math.round(s.confidence)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, s.confidence)}%`,
                        backgroundColor: confidenceBarColor(s.confidence),
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    {s.verifiedAt && <span>Verified {formatMonth(s.verifiedAt)}</span>}
                    {s.expiresAt && <span>Expires {formatMonth(s.expiresAt)}</span>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Claimed skills */}
        {resume.claimedSkills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-muted-foreground font-normal">
                From your resume — not yet verified:
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {resume.claimedSkills.map((s) => (
                  <Badge key={s.skill} variant="secondary" className="text-muted-foreground">
                    {s.skill}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Project Spotlight */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Project Spotlight
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resume.projects.length === 0 && !expertCompleted ? (
              <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-muted-foreground">
                <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>
                  Complete the AI Expert Interview to unlock your project showcase. Your projects will be extracted from
                  your interview transcript.
                </p>
              </div>
            ) : resume.projects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                No project spotlight yet — it will appear here after your expert interview is processed.
              </div>
            ) : (
              resume.projects.map((p, i) => {
                const approveKey = p.interviewId ?? p.name;
                return (
                  <div key={`${p.name}-${i}`} className="space-y-3 border-b border-border/60 pb-6 last:border-0 last:pb-0">
                    {p.pendingReview && (
                      <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 p-3 space-y-2">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Review your project summary before it&apos;s shown to recruiters
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleApproveProject(approveKey)}
                            disabled={approvingId === approveKey}
                          >
                            {approvingId === approveKey ? "Approving…" : "Approve — Looks Good"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setCorrectionOpen(true)}>
                            Request Correction
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-base">{p.name}</h3>
                      {p.role && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Your role:</span> {p.role}
                        </p>
                      )}
                      {p.problemSolved && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Problem solved:</span> {p.problemSolved}
                        </p>
                      )}
                      {p.techStack && p.techStack.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {p.techStack.map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {!p.pendingReview && p.keyDecisions && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Key decisions:</span> {p.keyDecisions}
                        </p>
                      )}
                      {!p.pendingReview && p.outcome && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">Outcome:</span> {p.outcome}
                        </p>
                      )}
                      {!p.pendingReview && (
                        <p className="text-xs text-primary flex items-center gap-1 mt-1">
                          <Sparkles className="h-3 w-3" />
                          Extracted from your ProvenHire AI Expert Interview
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Assessment Scores */}
        {hasAssessmentBlock && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assessment Scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {scoreEntries.map(([key, val]) => {
                const label =
                  key === "aiSkills" && val?.label
                    ? val.label
                    : key === "dsa"
                      ? "DSA Round"
                      : key === "systemDesign"
                        ? "System Design"
                        : key === "aiExpert"
                          ? "AI Expert"
                          : key;
                const gold = key === "aiExpert" && (val.score ?? 0) >= 85;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span>{label}</span>
                      <span className="font-semibold tabular-nums shrink-0">
                        {val.score}/100
                        {gold ? " · Gold Badge" : ""}
                      </span>
                    </div>
                    <Progress value={val.score ?? 0} className="h-2" />
                    {val.monthYear && <p className="text-xs text-muted-foreground">{val.monthYear}</p>}
                  </div>
                );
              })}
              {typeof scores.overall === "number" && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between font-semibold">
                    <span>Overall Score</span>
                    <span className="tabular-nums">{scores.overall as number}/100</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Work experience */}
        {workList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Work Experience</CardTitle>
              <p className="text-xs text-muted-foreground">{resume.professionalBackground.disclaimer}</p>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {workList.map((w, i) => {
                const company = String(w.company ?? w.employer ?? "").trim();
                const role = String(w.title ?? w.role ?? "").trim();
                return (
                <div key={i} className="text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {company}
                    {role ? ` · ${role}` : ""}
                  </p>
                  {w.startDate || w.endDate ? (
                    <p className="text-xs">
                      ({[w.startDate, w.endDate].filter(Boolean).join(" – ")})
                    </p>
                  ) : null}
                  {Array.isArray(w.bullets) && w.bullets.length > 0 && (
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      {w.bullets.map((b, j) => (
                        <li key={j}>{String(b)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
              })}
            </CardContent>
          </Card>
        )}

        {/* Share */}
        {resume.shareableProfileUrl && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold">Share your verified profile with employers</h3>
              <p className="text-sm font-mono break-all text-muted-foreground">{resume.shareableProfileUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={copyLink}>
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Recruiters see your certification badge, verified skills, and scores.
              </p>
              <p className="text-xs text-muted-foreground">Your contact details are never shown on the public URL.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request a correction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Describe what needs to be corrected</p>
            <textarea
              className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="e.g. The project name should be corrected…"
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCorrectionOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSubmitCorrection()} disabled={submittingCorrection}>
                {submittingCorrection ? "Sending…" : "Submit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
