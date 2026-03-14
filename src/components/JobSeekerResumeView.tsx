/**
 * Full resume / skill passport view for job seekers — same layout recruiters see.
 * Lets users view and share their verified profile (e.g. LinkedIn, applications).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  MapPin,
  Briefcase,
  GraduationCap,
  Award,
  CheckCircle2,
  Mail,
  Phone,
  Share2,
  FileText,
} from "lucide-react";
import ResumeViewButton from "@/components/ResumeViewButton";

type EducationItem = { institution?: string; degree?: string; year?: string } | string;
type WorkItem = { company?: string; role?: string; years?: string; bullets?: string[] } | string;

interface JobSeekerResumeViewProps {
  profile: {
    fullName?: string | null;
    full_name?: string | null;
    email?: string | null;
    currentRole?: string | null;
    current_role?: string | null;
    experienceYears?: number | null;
    experience_years?: number | null;
    skills?: string[];
    targetJobTitle?: string | null;
    target_job_title?: string | null;
    about?: string | null;
    phone?: string | null;
    location?: string | null;
    college?: string | null;
    graduationYear?: string | null;
    graduation_year?: string | number | null;
    resumeUrl?: string | null;
    resume_url?: string | null;
    education?: EducationItem[] | string;
    workExperience?: WorkItem[] | string;
    work_experience?: WorkItem[] | string;
    noticePeriod?: string | null;
    notice_period?: string | null;
    currentSalary?: string | null;
    current_salary?: string | null;
    expectedSalary?: string | null;
    expected_salary?: string | null;
  } | null;
  userEmail?: string | null;
  certificationLevelNumber: number;
  certificationLabel: string;
  aptitudeScore?: number | null;
  dsaScore?: number | null;
  aiInterviewScore?: number | null;
  expertInterviewScore?: number | null;
  assignmentScore?: number | null;
  roleType?: "technical" | "non_technical";
}

const CERT_LABELS: Record<number, string> = {
  0: "Not Yet Certified",
  1: "Cognitive Verified",
  2: "Skill Passport",
  3: "Elite Verified",
};

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "??";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

function normalizeEducation(ed: EducationItem[] | string | undefined): EducationItem[] {
  if (!ed) return [];
  if (typeof ed === "string") return ed.split("\n").filter(Boolean).map((line) => ({ institution: "", degree: "", year: line }));
  return Array.isArray(ed) ? ed : [];
}

function normalizeWork(work: WorkItem[] | string | undefined): WorkItem[] {
  if (!work) return [];
  if (typeof work === "string") return work.split("\n").filter(Boolean).map((line) => line);
  return Array.isArray(work) ? work : [];
}

export default function JobSeekerResumeView({
  profile,
  userEmail,
  certificationLevelNumber,
  certificationLabel,
  aptitudeScore,
  dsaScore,
  aiInterviewScore,
  expertInterviewScore,
  assignmentScore,
  roleType = "technical",
}: JobSeekerResumeViewProps) {
  if (!profile) {
    return (
      <div className="rounded-xl border border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)] p-8 text-center text-[var(--dash-text-muted)]">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Complete your profile in Settings to see your full resume here.</p>
      </div>
    );
  }

  const fullName = profile.fullName ?? profile.full_name ?? "";
  const currentRole = profile.currentRole ?? profile.current_role;
  const experienceYears = profile.experienceYears ?? profile.experience_years;
  const targetJobTitle = profile.targetJobTitle ?? profile.target_job_title;
  const email = profile.email ?? userEmail;
  const resumeUrl = profile.resumeUrl ?? profile.resume_url;
  const education = normalizeEducation(profile.education ?? (profile as any).education);
  const workExperience = normalizeWork(profile.workExperience ?? profile.work_experience ?? (profile as any).work_experience);
  const skills = Array.isArray(profile.skills) ? profile.skills : typeof profile.skills === "string" ? profile.skills.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
  const certLevel = certificationLevelNumber;
  const certLabel = CERT_LABELS[certLevel] ?? certificationLabel;
  const hiringReadiness = Math.round(
    ((aptitudeScore ?? 0) + (dsaScore ?? 0) + (aiInterviewScore ?? 0) + 100) / 4
  );

  return (
    <div className="space-y-6">
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-2 px-4 text-sm text-emerald-600 dark:text-emerald-400">
        <span className="font-semibold">Your verified resume</span>
        <span className="text-muted-foreground ml-2">— Use this view to share on LinkedIn or with recruiters</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left sidebar */}
        <aside className="lg:col-span-4 space-y-4">
          <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center text-2xl font-bold text-primary mb-3">
                  {getInitials(fullName)}
                </div>
                <h1 className="text-xl font-bold text-white">{fullName || "Candidate"}</h1>
                <p className="text-sm text-primary font-medium mb-4">
                  {currentRole || targetJobTitle || "Job Seeker"}
                </p>
                <div className="w-full rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-4">
                  <div className="flex items-center gap-2 justify-center">
                    <Award className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-primary">{certLabel}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Level {certLevel} Certification</p>
                </div>
                <div className="w-full mb-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground uppercase font-semibold">Hiring Readiness</span>
                    <span className="font-bold text-primary">{hiringReadiness}%</span>
                  </div>
                  <Progress value={hiringReadiness} className="h-2" />
                </div>
              </div>
              <div className="space-y-3 pt-4 border-t border-border">
                {profile.location && (
                  <div className="flex gap-3">
                    <MapPin className="h-5 w-5 text-primary shrink-0" />
                    <p className="font-medium text-sm">{profile.location}</p>
                  </div>
                )}
                {experienceYears != null && (
                  <div className="flex gap-3">
                    <Briefcase className="h-5 w-5 text-primary shrink-0" />
                    <p className="font-medium text-sm">{experienceYears} years experience</p>
                  </div>
                )}
                {(profile.college || (profile.graduationYear ?? profile.graduation_year)) && (
                  <div className="flex gap-3">
                    <GraduationCap className="h-5 w-5 text-primary shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">{profile.college || "—"}</p>
                      <p className="text-muted-foreground">{String(profile.graduationYear ?? profile.graduation_year ?? "")}</p>
                    </div>
                  </div>
                )}
                {(profile.expectedSalary ?? profile.expected_salary ?? profile.currentSalary ?? profile.current_salary) && (
                  <div className="flex gap-3">
                    <span className="text-lg">💰</span>
                    <p className="font-medium text-sm">{profile.expectedSalary ?? profile.expected_salary ?? profile.currentSalary ?? profile.current_salary}</p>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Verification Scores</p>
                <div className="grid grid-cols-2 gap-2">
                  {roleType === "technical" && (
                    <>
                      <div className="rounded-lg border bg-muted/30 p-2 text-center">
                        <p className="text-lg font-bold text-primary">{aptitudeScore ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Aptitude</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-2 text-center">
                        <p className="text-lg font-bold text-primary">{dsaScore ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Live Coding</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-2 text-center">
                        <p className="text-lg font-bold text-primary">{aiInterviewScore ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">AI Interview</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-2 text-center">
                        <p className="text-lg font-bold text-primary">{expertInterviewScore ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Expert</p>
                      </div>
                    </>
                  )}
                  {roleType === "non_technical" && (
                    <>
                      <div className="rounded-lg border bg-muted/30 p-2 text-center">
                        <p className="text-lg font-bold text-primary">{assignmentScore ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Assignment</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-2 text-center">
                        <p className="text-lg font-bold text-primary">{expertInterviewScore ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">Expert</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Proctoring passed · Verified assessments</p>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Main */}
        <main className="lg:col-span-5 space-y-4">
          {profile.about && (
            <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">About</p>
                <p className="text-sm text-muted-foreground">{profile.about}</p>
              </CardContent>
            </Card>
          )}
          {skills.length > 0 && (
            <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Skills & Technologies</p>
                <div className="flex flex-wrap gap-2">
                  {skills.map((s, i) => (
                    <Badge key={i} variant="secondary" className="font-medium">
                      {s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {roleType === "technical" && (dsaScore != null || aptitudeScore != null || aiInterviewScore != null) && (
            <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Assessment Scores</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {aptitudeScore != null && (
                    <div className="text-center p-3 rounded-lg border border-border">
                      <p className="text-2xl font-bold text-primary">{aptitudeScore}</p>
                      <p className="text-xs text-muted-foreground">Aptitude</p>
                    </div>
                  )}
                  {dsaScore != null && (
                    <div className="text-center p-3 rounded-lg border border-border">
                      <p className="text-2xl font-bold text-primary">{dsaScore}</p>
                      <p className="text-xs text-muted-foreground">Live Coding</p>
                    </div>
                  )}
                  {aiInterviewScore != null && (
                    <div className="text-center p-3 rounded-lg border border-border">
                      <p className="text-2xl font-bold text-primary">{aiInterviewScore}</p>
                      <p className="text-xs text-muted-foreground">AI Interview</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {education.length > 0 && (
            <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Education</p>
                <div className="space-y-2">
                  {education.map((e, i) => {
                    if (typeof e === "string") {
                      return (
                        <div key={i} className="flex gap-2">
                          <span className="text-primary">→</span>
                          <span className="text-sm text-muted-foreground">{e}</span>
                        </div>
                      );
                    }
                    return (
                      <p key={i} className="text-sm">
                        {[e.degree, e.institution, e.year].filter(Boolean).join(" · ")}
                      </p>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {workExperience.length > 0 && (
            <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Work Experience</p>
                <div className="space-y-4">
                  {workExperience.map((exp, i) => {
                    if (typeof exp === "string") {
                      return (
                        <div key={i} className="flex gap-2">
                          <span className="text-primary">→</span>
                          <span className="text-sm text-muted-foreground">{exp}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={i}>
                        <p className="font-semibold text-sm">{exp.role}</p>
                        <p className="text-sm text-primary">{exp.company}</p>
                        {exp.years && <p className="text-xs text-muted-foreground">{exp.years}</p>}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </main>

        {/* Right: Share / Download */}
        <aside className="lg:col-span-3 space-y-4">
          <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
            <CardContent className="pt-6">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Share2 className="h-3.5 w-3.5" />
                Share & use
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Use this verified resume on LinkedIn, job applications, or share the link with recruiters.
              </p>
              {resumeUrl && (
                <ResumeViewButton resumeUrl={resumeUrl} label="Download resume" className="w-full mb-2" />
              )}
              <Button variant="outline" className="w-full" onClick={() => window.print()}>
                <FileText className="h-4 w-4 mr-2" />
                Print / Save as PDF
              </Button>
            </CardContent>
          </Card>
          {(email || profile.phone) && (
            <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Contact</p>
                <div className="space-y-2">
                  {email && (
                    <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Mail className="h-4 w-4" />
                      {email}
                    </a>
                  )}
                  {profile.phone && (
                    <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Phone className="h-4 w-4" />
                      {profile.phone}
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
