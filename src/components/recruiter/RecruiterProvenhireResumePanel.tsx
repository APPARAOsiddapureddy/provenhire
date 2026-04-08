import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Briefcase, Sparkles, Users, Video } from "lucide-react";

export type ProvenhireResumeRecruiterShape = {
  shareableProfileUrl: string;
  certificationLevel: string;
  certificationDate: string | null;
  identity: {
    name: string | null;
    currentOrTargetRole: string | null;
    experienceLevel: string;
    location: string | null;
    noticePeriod: string | null;
    expectedSalaryRange: string | null;
    education: unknown;
  };
  verifiedSkills: Array<{ skill: string; confidence: number; verifiedAt?: string | null; expiresAt?: string | null }>;
  claimedSkills: Array<{ skill: string; source: string }>;
  projects: Array<{
    name: string;
    role?: string;
    problemSolved?: string;
    techStack?: string[];
    keyDecisions?: string;
    outcome?: string;
    pendingReview?: boolean;
    extractedAt?: string;
  }>;
  assessmentScores: Record<string, unknown>;
  professionalBackground: {
    workExperience: unknown;
    education: unknown;
    disclaimer: string;
  };
};

function formatMonth(d: string | null | undefined): string {
  if (!d) return "";
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function ScoreBar({ label, score, sub }: { label: string; score: number | null; sub?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">
          {score != null ? `${score}/100` : "—"}
          {sub ? <span className="text-muted-foreground font-normal"> · {sub}</span> : null}
        </span>
      </div>
      {score != null && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, score)}%` }} />
        </div>
      )}
    </div>
  );
}

export function RecruiterProvenhireResumePanel({
  resume,
  jobTitle,
  matchPercent,
}: {
  resume: ProvenhireResumeRecruiterShape;
  jobTitle?: string | null;
  matchPercent?: number | null;
}) {
  const scores = resume.assessmentScores || {};
  const dsa = scores.dsa as { score?: number | null } | undefined;
  const aiExpert = scores.aiExpert as { score?: number | null; badgeLevel?: string | null } | undefined;
  const aiSkills = scores.aiSkills as { score?: number | null } | undefined;
  const systemDesign = scores.systemDesign as { score?: number | null } | undefined;

  const work =
    Array.isArray(resume.professionalBackground.workExperience) &&
    resume.professionalBackground.workExperience.length > 0
      ? (resume.professionalBackground.workExperience as Array<Record<string, unknown>>)
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {resume.identity.name || "Verified candidate"}
            </h1>
            <Badge variant="secondary" className="gap-1">
              <Award className="h-3 w-3" />
              {resume.certificationLevel}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {[resume.identity.currentOrTargetRole, resume.identity.experienceLevel].filter(Boolean).join(" · ")}
            {resume.identity.location ? ` · ${resume.identity.location}` : ""}
            {resume.identity.noticePeriod ? ` · ${resume.identity.noticePeriod} notice` : ""}
          </p>
          {resume.certificationDate && (
            <p className="text-xs text-muted-foreground mt-1">
              Verified {formatMonth(resume.certificationDate)}
            </p>
          )}
        </div>
        {matchPercent != null && Number.isFinite(matchPercent) && jobTitle && (
          <Card className="sm:min-w-[200px] border-primary/20 bg-primary/5">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground mb-0.5">Match for {jobTitle}</p>
              <p className="text-2xl font-bold tabular-nums">{matchPercent}%</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Verified skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {resume.verifiedSkills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verified skills on file yet.</p>
          ) : (
            <ul className="space-y-3">
              {resume.verifiedSkills.map((s) => (
                <li key={s.skill} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{s.skill}</span>
                    <span className="text-muted-foreground tabular-nums">{Math.round(s.confidence)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, s.confidence)}%` }}
                    />
                  </div>
                  {(s.verifiedAt || s.expiresAt) && (
                    <p className="text-xs text-muted-foreground">{formatMonth(s.verifiedAt || s.expiresAt)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {resume.claimedSkills.length > 0 && (
            <div className="pt-2 border-t border-border/60">
              <p className="text-sm font-medium mb-1">Claimed (not verified)</p>
              <p className="text-sm text-muted-foreground">{resume.claimedSkills.map((c) => c.skill).join(", ")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {resume.projects.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Project spotlight</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {resume.projects.map((p) => (
              <div key={p.name} className="space-y-2">
                <p className="font-semibold">{p.name}</p>
                {p.role && <p className="text-muted-foreground">{p.role}</p>}
                {p.problemSolved && <p>{p.problemSolved}</p>}
                {p.techStack && p.techStack.length > 0 && (
                  <p className="text-xs text-muted-foreground">Stack: {p.techStack.join(" · ")}</p>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  From ProvenHire AI Expert Interview
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Assessment scores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-lg">
          <ScoreBar label="DSA round" score={typeof dsa?.score === "number" ? dsa.score : null} />
          {typeof aiSkills?.score === "number" && <ScoreBar label="AI skills interview" score={aiSkills.score} />}
          {typeof systemDesign?.score === "number" && (
            <ScoreBar label="System design" score={systemDesign.score} />
          )}
          <ScoreBar
            label="AI expert interview"
            score={typeof aiExpert?.score === "number" ? aiExpert.score : null}
            sub={aiExpert?.badgeLevel ? String(aiExpert.badgeLevel) : undefined}
          />
        </CardContent>
      </Card>

      {work.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Work experience</CardTitle>
            <p className="text-xs text-muted-foreground">{resume.professionalBackground.disclaimer}</p>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {work.slice(0, 6).map((w, i) => (
              <p key={i} className="text-muted-foreground">
                {String(w.company ?? w.employer ?? "")}
                {w.title ? ` · ${String(w.title)}` : ""}
                {w.startDate || w.endDate
                  ? ` (${[w.startDate, w.endDate].filter(Boolean).join(" – ")})`
                  : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/15">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Next steps
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            JD-based AI interviews and recruiter-paid expert sessions are rolling out next. Express interest below to
            contact the candidate today.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              JD AI interview
            </div>
            <p className="text-xs text-muted-foreground">Custom interview from your job description · ₹799</p>
            <Button variant="secondary" size="sm" disabled className="mt-auto">
              Coming soon
            </Button>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-medium">
              <Video className="h-4 w-4 text-primary" />
              Expert interview
            </div>
            <p className="text-xs text-muted-foreground">Live expert session · ₹2,500</p>
            <Button variant="secondary" size="sm" disabled className="mt-auto">
              Coming soon
            </Button>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-medium">
              <Users className="h-4 w-4 text-primary" />
              Your team
            </div>
            <p className="text-xs text-muted-foreground">Schedule with your own interviewers · Free</p>
            <Button variant="secondary" size="sm" disabled className="mt-auto">
              Coming soon
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Public preview:{" "}
        <a className="underline hover:text-foreground" href={resume.shareableProfileUrl} target="_blank" rel="noreferrer">
          {resume.shareableProfileUrl}
        </a>
      </p>
    </div>
  );
}
