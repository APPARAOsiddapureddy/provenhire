/**
 * Recruiter-facing candidate profile view.
 * Design based on ProvenHire candidate profile mockup: 3-column layout,
 * certification badge, scores, AI summary, work experience, proctoring status.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin,
  Briefcase,
  GraduationCap,
  Award,
  CheckCircle2,
  Calendar,
  MessageSquare,
  Star,
  ChevronLeft,
  Loader2,
  Mail,
  Phone,
} from "lucide-react";
import ResumeViewButton from "@/components/ResumeViewButton";
import { useToast } from "@/hooks/use-toast";

// API may return objects or strings (ProfileSetup stores as string[] per line)
type EducationItem = { institution?: string; degree?: string; year?: string } | string;
type WorkExperienceItem = { company?: string; role?: string; years?: string; bullets?: string[] } | string;

interface CandidateProfile {
  id: string;
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  current_role?: string | null;
  experience_years?: number | null;
  verification_status?: string | null;
  skills?: string[];
  target_job_title?: string | null;
  about?: string | null;
  phone?: string | null;
  location?: string | null;
  college?: string | null;
  graduation_year?: string | number | null;
  resume_url?: string | null;
  education?: EducationItem[];
  work_experience?: WorkExperienceItem[];
  certification_level?: number;
  certification_label?: string;
  aptitude_score?: number | null;
  dsa_score?: number | null;
  ai_interview_score?: number | null;
  human_expert_interview_score?: number | null;
  assignment_score?: number | null;
  integrity_score?: number | null;
  notice_period?: string | null;
  current_salary?: string | null;
  expected_salary?: string | null;
  proctoring_events?: number;
  skill_freshness?: {
    aptitude?: { status: string; last_verified_days_ago: number | null } | null;
    live_coding?: { status: string; last_verified_days_ago: number | null } | null;
    interview?: { status: string; last_verified_days_ago: number | null } | null;
  };
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

const CandidateProfilePage = () => {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recruiterNote, setRecruiterNote] = useState("");

  useEffect(() => {
    if (!profileId) return;
    api
      .get<{ profile: CandidateProfile }>(`/api/users/candidates/${profileId}`)
      .then((r) => setProfile(r.profile))
      .catch(() => toast({ title: "Failed to load profile", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [profileId, toast]);

  const handleExpressInterest = async () => {
    if (!profile?.user_id) return;
    try {
      await api.post("/api/notifications/contact-candidate", {
        candidateUserId: profile.user_id,
        recruiterMessage: recruiterNote || undefined,
      });
      toast({ title: "Interest sent", description: "The candidate has been notified." });
    } catch {
      toast({ title: "Failed to send interest", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container py-16 text-center">
          <p className="text-muted-foreground mb-4">Candidate not found</p>
          <Button variant="outline" onClick={() => navigate("/candidate-search")}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </div>
      </div>
    );
  }

  const certLevel = profile.certification_level ?? 0;
  const certLabel = CERT_LABELS[certLevel] ?? profile.certification_label ?? "Not Yet Certified";
  const hiringReadiness = Math.round(
    ((profile.aptitude_score ?? 0) + (profile.dsa_score ?? 0) + (profile.ai_interview_score ?? 0) + (profile.integrity_score ?? 100)) / 4
  );
  const codingScore = profile.dsa_score ?? 0;
  const commsScore = profile.ai_interview_score ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Status bar */}
      <div className="bg-emerald-500/10 border-b border-emerald-500/20 py-2 px-4">
        <div className="container flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {profile.verification_status === "verified" ? "All assessments verified & complete" : "Verification in progress"}
          </span>
          <span className="text-muted-foreground">
            · {profile.target_job_title || "Open to roles"}
          </span>
        </div>
      </div>

      {/* Breadcrumb bar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="container flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigate("/candidate-search")}
              className="text-muted-foreground hover:text-foreground"
            >
              Candidates
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="text-primary font-semibold">
              {profile.full_name || "Candidate"}
            </span>
          </div>
          <Badge variant="outline" className="text-primary border-primary/40">
            Recruiter View
          </Badge>
        </div>
      </div>

      <div className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ===== LEFT SIDEBAR ===== */}
          <aside className="lg:col-span-4 space-y-4">
            <Card className="border-primary/10 bg-card/80">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center text-2xl font-bold text-primary mb-3">
                    {getInitials(profile.full_name)}
                  </div>
                  <h1 className="text-xl font-bold">{profile.full_name || "Candidate"}</h1>
                  <p className="text-sm text-primary font-medium mb-4">
                    {profile.current_role || profile.target_job_title || "Job Seeker"}
                  </p>

                  <div className="w-full rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-4">
                    <div className="flex items-center gap-2 justify-center">
                      <Award className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-primary">{certLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Level {certLevel} Certification
                    </p>
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
                      <div>
                        <p className="font-medium">{profile.location}</p>
                        <p className="text-xs text-muted-foreground">Open to remote</p>
                      </div>
                    </div>
                  )}
                  {profile.experience_years != null && (
                    <div className="flex gap-3">
                      <Briefcase className="h-5 w-5 text-primary shrink-0" />
                      <div>
                        <p className="font-medium">{profile.experience_years} years</p>
                        <p className="text-xs text-muted-foreground">Experience</p>
                      </div>
                    </div>
                  )}
                  {(profile.college || profile.graduation_year) && (
                    <div className="flex gap-3">
                      <GraduationCap className="h-5 w-5 text-primary shrink-0" />
                      <div>
                        <p className="font-medium">{profile.college || "—"}</p>
                        <p className="text-xs text-muted-foreground">{profile.graduation_year ?? ""}</p>
                      </div>
                    </div>
                  )}
                  {(profile.expected_salary || profile.current_salary) && (
                    <div className="flex gap-3">
                      <span className="text-lg">💰</span>
                      <div>
                        <p className="font-medium">{profile.expected_salary || profile.current_salary}</p>
                        <p className="text-xs text-muted-foreground">Expected CTC</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Verification Scores</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { label: "Aptitude", val: profile.aptitude_score },
                      { label: "Live Coding", val: profile.dsa_score },
                      { label: "AI Interview", val: profile.ai_interview_score },
                      ...(profile.human_expert_interview_score != null ? [{ label: "Expert Interview", val: profile.human_expert_interview_score }] : []),
                      ...(profile.assignment_score != null ? [{ label: "Assignment", val: profile.assignment_score }] : []),
                      { label: "Integrity", val: profile.integrity_score },
                    ].map(({ label, val }) => (
                      <div key={label} className="rounded-lg border bg-muted/30 p-2 text-center">
                        <p className="text-lg font-bold text-primary">{val ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                      </div>
                    ))}
                  </div>
                  {profile.skill_freshness && (profile.skill_freshness.aptitude || profile.skill_freshness.live_coding || profile.skill_freshness.interview) && (
                    <div className="mt-3 pt-3 border-t border-border space-y-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Freshness</p>
                      {profile.skill_freshness.aptitude && (
                        <p className="text-xs text-muted-foreground">
                          Aptitude: {profile.skill_freshness.aptitude.status === "EXPIRED" ? "Expired" : `Last verified ${profile.skill_freshness.aptitude.last_verified_days_ago ?? 0} days ago`}
                        </p>
                      )}
                      {profile.skill_freshness.live_coding && (
                        <p className="text-xs text-muted-foreground">
                          Live Coding: {profile.skill_freshness.live_coding.status === "EXPIRED" ? "Expired" : `Last verified ${profile.skill_freshness.live_coding.last_verified_days_ago ?? 0} days ago`}
                        </p>
                      )}
                      {profile.skill_freshness.interview && (
                        <p className="text-xs text-muted-foreground">
                          Interview: {profile.skill_freshness.interview.status === "EXPIRED" ? "Expired" : `Last verified ${profile.skill_freshness.interview.last_verified_days_ago ?? 0} days ago`}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {profile.proctoring_events === 0 && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">Proctoring Passed</p>
                      <p className="text-xs text-muted-foreground">Zero violations detected</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>

          {/* ===== MAIN PANEL ===== */}
          <main className="lg:col-span-5 space-y-4">
            {/* AI Summary */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">AI Recruiter Summary</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2">✓ Strengths</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {profile.dsa_score != null && profile.dsa_score >= 70 && (
                        <li>• Strong problem-solving and coding ability</li>
                      )}
                      {profile.ai_interview_score != null && profile.ai_interview_score >= 70 && (
                        <li>• Clear communication and technical articulation</li>
                      )}
                      {profile.experience_years != null && profile.experience_years >= 3 && (
                        <li>• Solid industry experience</li>
                      )}
                      {profile.about && <li>• {profile.about.slice(0, 80)}...</li>}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">⚠ Improvement Areas</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {(!profile.dsa_score || profile.dsa_score < 70) && <li>• Coding assessment not yet completed</li>}
                      {(!profile.ai_interview_score || profile.ai_interview_score < 70) && (
                        <li>• AI interview not yet completed</li>
                      )}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Skills & Technologies</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((s, i) => (
                      <Badge key={i} variant="secondary" className="font-medium">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Coding / DSA */}
            {profile.dsa_score != null && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Coding Assessment</p>
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                      <div className="w-24 h-24 rounded-full border-4 border-primary flex items-center justify-center">
                        <span className="text-2xl font-bold text-primary">{profile.dsa_score}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">DSA Score</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Role-specific coding assessment completed. Score reflects problem-solving ability and code quality.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Aptitude */}
            {profile.aptitude_score != null && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Aptitude Test</p>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-primary">{profile.aptitude_score}</p>
                      <p className="text-xs text-muted-foreground">/ 100</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Logical reasoning, quantitative aptitude, and verbal ability.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Interview */}
            {profile.ai_interview_score != null && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">AI Interview Evaluation</p>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-primary">{profile.ai_interview_score}</p>
                      <p className="text-xs text-muted-foreground">/ 100</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Communication clarity, confidence, and technical depth evaluated through AI interview.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Human Expert Interview */}
            {profile.human_expert_interview_score != null && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Expert Interview</p>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-primary">{profile.human_expert_interview_score}</p>
                      <p className="text-xs text-muted-foreground">/ 100</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Live evaluation by industry expert. Technical depth, problem-solving, and authenticity.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Education (when stored as array) */}
            {profile.education && profile.education.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Education</p>
                  <div className="space-y-2">
                    {profile.education.map((e, i) => {
                      const item = e as EducationItem;
                      if (typeof item === "string") {
                        return (
                          <div key={i} className="flex gap-2">
                            <span className="text-primary">→</span>
                            <span className="text-sm text-muted-foreground">{item}</span>
                          </div>
                        );
                      }
                      return (
                        <p key={i} className="text-sm">
                          {[item.degree, item.institution, item.year].filter(Boolean).join(" · ")}
                        </p>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Work Experience */}
            {profile.work_experience && profile.work_experience.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Work Experience</p>
                  <div className="space-y-4">
                    {profile.work_experience.map((exp, i) => {
                      const item = exp as WorkExperienceItem;
                      if (typeof item === "string") {
                        return (
                          <div key={i} className="flex gap-2">
                            <span className="text-primary">→</span>
                            <span className="text-sm text-muted-foreground">{item}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={i}>
                          <p className="font-semibold">{item.role}</p>
                          <p className="text-sm text-primary">{item.company}</p>
                          {item.years && <p className="text-xs text-muted-foreground">{item.years}</p>}
                          {item.bullets && item.bullets.length > 0 && (
                            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                              {item.bullets.map((b, j) => (
                                <li key={j} className="flex gap-2">
                                  <span className="text-primary">→</span>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Proctoring */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Integrity & Proctoring</p>
                <div className="flex items-center gap-3 mb-4">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Proctoring Passed
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {profile.proctoring_events === 0
                      ? "No violations detected"
                      : `${profile.proctoring_events} event(s) logged`}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">Assessment completed with proctoring enabled</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </main>

          {/* ===== RIGHT PANEL ===== */}
          <aside className="lg:col-span-3 space-y-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Recruiter Actions</p>
                <div className="space-y-2">
                  <Button className="w-full" onClick={handleExpressInterest}>
                    <Star className="h-4 w-4 mr-2" />
                    Shortlist / Express Interest
                  </Button>
                  <Button variant="outline" className="w-full">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Interview
                  </Button>
                  <Button variant="outline" className="w-full">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                  {profile.resume_url && (
                    <ResumeViewButton resumeUrl={profile.resume_url} label="Download Profile" className="w-full" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Job Match</p>
                <div className="text-center mb-4">
                  <div className="w-24 h-24 rounded-full border-4 border-primary mx-auto flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary">{hiringReadiness}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Overall fit</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Technical</span>
                    <span className="font-semibold">{profile.dsa_score ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Communication</span>
                    <span className="font-semibold">{profile.ai_interview_score ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Integrity</span>
                    <span className="font-semibold text-emerald-600">{profile.integrity_score ?? "—"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Recruiter Notes</p>
                <Textarea
                  placeholder="Add private notes..."
                  value={recruiterNote}
                  onChange={(e) => setRecruiterNote(e.target.value)}
                  className="min-h-[80px]"
                />
                <Button variant="outline" size="sm" className="mt-2 w-full">
                  Save Note
                </Button>
              </CardContent>
            </Card>

            {(profile.phone || profile.email) && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Contact</p>
                  <div className="space-y-2">
                    {profile.email && (
                      <a
                        href={`mailto:${profile.email}`}
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Mail className="h-4 w-4" />
                        {profile.email}
                      </a>
                    )}
                    {profile.phone && (
                      <a
                        href={`tel:${profile.phone}`}
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
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

      <Footer />
    </div>
  );
};

export default CandidateProfilePage;
