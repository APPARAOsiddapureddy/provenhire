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

interface AssessmentScores {
  dsa?: { score: number | null; status: string | null; monthYear: string | null };
  aiSkills?: { score: number | null; status: string | null; monthYear: string | null };
  systemDesign?: { score: number | null; status: string | null; monthYear: string | null };
  aiExpert?: { score: number | null; status: string | null; monthYear: string | null; badgeLevel?: string | null };
  overall: number | null;
}

interface ResumeData {
  certificationLevel: string;
  certificationDate: string | null;
  verifiedSkills: VerifiedSkill[];
  claimedSkills: ClaimedSkill[];
  projects: Project[];
  assessmentScores: AssessmentScores;
  shareableHandle: string | null;
  shareableProfileUrl: string | null;
  pendingCandidateReview: boolean;
  identity: {
    name: string | null;
    currentOrTargetRole: string | null;
    experienceLevel: string;
  };
}

const CERT_COLORS: Record<string, string> = {
  L0: "bg-muted text-muted-foreground",
  L1: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  L2: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  L3: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

function confidenceColor(c: number): string {
  if (c >= 80) return "bg-green-500";
  if (c >= 65) return "bg-yellow-500";
  if (c >= 50) return "bg-orange-500";
  return "bg-red-400";
}

function formatMonth(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

const STAGE_LABELS: Record<string, string> = {
  dsa: "DSA Round",
  aiSkills: "AI Skills Interview",
  systemDesign: "System Design",
  aiExpert: "Expert Interview",
};

export default function ProvenHireResumePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
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
    toast.success("Link copied to clipboard!");
  };

  const handleApproveProjects = async () => {
    setApproving(true);
    try {
      await api.post("/api/users/me/provenhire-resume/review/approve");
      toast.success("Project approved! It's now visible to recruiters.");
      const res = await api.get<{ resume: ResumeData }>("/api/users/me/provenhire-resume");
      setResume(res.resume);
    } catch {
      toast.error("Failed to approve project.");
    } finally {
      setApproving(false);
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
        section: "project",
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

  const shellUser = user ? jobSeekerShellUser(user) : undefined;

  if (loading) {
    return (
      <DashboardShell user={shellUser}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      </DashboardShell>
    );
  }

  if (!resume) {
    return (
      <DashboardShell user={shellUser}>
        <div className="max-w-3xl mx-auto py-10 text-center space-y-4">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Resume not yet available</h2>
          <p className="text-muted-foreground">
            Complete your verification pipeline to generate your ProvenHire Resume.
          </p>
          <Button variant="outline" onClick={() => navigate("/dashboard/jobseeker")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to dashboard
          </Button>
        </div>
      </DashboardShell>
    );
  }

  const certClass = CERT_COLORS[resume.certificationLevel] ?? CERT_COLORS.L0;
  const hasScores = resume.assessmentScores?.overall != null;
  const scoreEntries = Object.entries(resume.assessmentScores ?? {}).filter(
    ([key]) => key !== "overall"
  ) as [string, { score: number | null; status: string | null; monthYear: string | null }][];

  return (
    <DashboardShell user={shellUser}>
      <div className="max-w-3xl mx-auto py-6 space-y-8">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/jobseeker")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Button>

        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-bold">ProvenHire Resume</h1>
                  <Badge className={certClass}>{resume.certificationLevel}</Badge>
                </div>
                {resume.identity?.name && (
                  <p className="text-muted-foreground">
                    {resume.identity.name}
                    {resume.identity.currentOrTargetRole && ` · ${resume.identity.currentOrTargetRole}`}
                  </p>
                )}
                {resume.certificationDate && (
                  <p className="text-xs text-muted-foreground">
                    Verified {formatMonth(resume.certificationDate)}
                  </p>
                )}
              </div>
              {resume.shareableProfileUrl && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={copyLink}>
                    <ClipboardCopy className="h-4 w-4 mr-1" />
                    Copy Link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(resume.shareableProfileUrl!, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {resume.shareableProfileUrl && (
              <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
                {resume.shareableProfileUrl}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Verified Skills */}
        {resume.verifiedSkills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Verified Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {resume.verifiedSkills.map((s) => (
                <div key={s.skill} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{s.skill}</span>
                    <span className="text-sm font-semibold">{Math.round(s.confidence)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${confidenceColor(s.confidence)}`}
                      style={{ width: `${Math.min(100, s.confidence)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    {s.verifiedAt && <span>Verified {formatMonth(s.verifiedAt)}</span>}
                    {s.expiresAt && <span>Expires {formatMonth(s.expiresAt)}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Claimed Skills */}
        {resume.claimedSkills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-muted-foreground">
                Skills from your resume (not yet verified)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {resume.claimedSkills.map((s) => (
                  <Badge key={s.skill} variant="secondary">
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
            {resume.projects.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <Lock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Complete the Expert Interview to unlock your verified project showcase.</p>
              </div>
            ) : (
              resume.projects.map((p, i) => (
                <div key={i} className="space-y-3">
                  {p.pendingReview && (
                    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 p-3 space-y-2">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Review your project summary before it's visible to recruiters
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleApproveProjects} disabled={approving}>
                          {approving ? "Approving…" : "Approve — Looks good"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCorrectionOpen(true)}
                        >
                          Request correction
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
                    {p.keyDecisions && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Key decisions:</span> {p.keyDecisions}
                      </p>
                    )}
                    {p.outcome && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Outcome:</span> {p.outcome}
                      </p>
                    )}
                    <p className="text-xs text-primary flex items-center gap-1 mt-1">
                      <Sparkles className="h-3 w-3" />
                      Extracted from your ProvenHire Expert Interview
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Assessment Scores */}
        {hasScores && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assessment Scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {scoreEntries
                .filter(([, v]) => v?.status === "completed" && v?.score != null)
                .map(([key, val]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{STAGE_LABELS[key] ?? key}</span>
                      <span className="font-semibold">{val.score}/100</span>
                    </div>
                    <Progress value={val.score ?? 0} className="h-2" />
                    {val.monthYear && (
                      <p className="text-xs text-muted-foreground">{val.monthYear}</p>
                    )}
                  </div>
                ))}
              {resume.assessmentScores.overall != null && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between font-semibold">
                    <span>Overall Score</span>
                    <span>{resume.assessmentScores.overall}/100</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Share section */}
        {resume.shareableProfileUrl && (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <h3 className="font-semibold">Share Your Verified Profile</h3>
              <p className="text-sm text-muted-foreground">
                Recruiters see your verified skills, scores, and project spotlight — your contact
                details are never shared on the public URL.
              </p>
              <Button onClick={copyLink}>
                <ClipboardCopy className="h-4 w-4 mr-2" />
                Copy shareable link
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Correction dialog */}
      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request a Correction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Describe what needs to be corrected in your project summary.
            </p>
            <textarea
              className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="e.g. The project name should be 'TaskFlow' not 'TaskFlowX'..."
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCorrectionOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitCorrection} disabled={submittingCorrection}>
                {submittingCorrection ? "Sending…" : "Submit Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
