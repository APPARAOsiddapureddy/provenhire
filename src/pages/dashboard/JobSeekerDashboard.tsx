import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CheckCircle, Clock, Settings, TrendingUp, Award, Eye, FileText, BookmarkCheck, Trash2, ExternalLink, User, Lock, ShieldAlert, LayoutGrid, FileCheck, ListChecks } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { api, BACKEND_DOWN_MSG, hasAuthToken } from "@/lib/api";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import SkillPassport from "@/components/SkillPassport";
import CandidateProfileView, { type CandidateProfileViewProfile } from "@/components/CandidateProfileView";
import { VerificationPipelineCard } from "@/components/VerificationPipelineCard";
import ReferAFriend from "@/components/ReferAFriend";
import VerificationGateDialog from "@/components/VerificationGateDialog";
import JobTitleModal from "@/components/JobTitleModal";
import { useVerificationGate } from "@/hooks/useVerificationGate";
import { Skeleton } from "@/components/ui/skeleton";
import { preloadVerificationFlow } from "@/preloads";
import DashboardShell from "@/components/DashboardShell";
import { jobSeekerShellUser } from "@/utils/jobSeekerIdentity";

const TECHNICAL_STAGE_ORDER = ['profile_setup', 'aptitude_test', 'dsa_round', 'expert_interview', 'human_expert_interview'] as const;
const NON_TECHNICAL_STAGE_ORDER = ['profile_setup', 'non_tech_assignment', 'human_expert_interview'] as const;
const STAGE_LABELS: Record<string, string> = {
  profile_setup: 'Profile Setup',
  aptitude_test: 'Cognitive Assessment',
  dsa_round: 'DSA Round',
  non_tech_assignment: 'Assignment',
  expert_interview: 'AI Expert Interview',
  human_expert_interview: 'Human Expert Interview',
};

const deriveCertificationFromStages = (
  roleType: "technical" | "non_technical",
  stages: Array<{ stage_name?: string; status?: string }>
): { level: number; label: string } => {
  const completed = new Set(
    stages.filter((s) => s.status === "completed").map((s) => s.stage_name).filter(Boolean) as string[]
  );
  if (roleType === "non_technical") {
    if (completed.has("human_expert_interview")) return { level: 2, label: "Level 2 - Expert Verified Candidate" };
    if (completed.has("profile_setup") && completed.has("non_tech_assignment")) {
      return { level: 1, label: "Level 1 - Skill Assignment Verified" };
    }
    return { level: 0, label: "Level 0 - Not Yet Certified" };
  }
  if (completed.has("human_expert_interview")) return { level: 3, label: "Level 3 - Elite ProvenHire Candidate" };
  if (completed.has("dsa_round") && completed.has("expert_interview")) return { level: 2, label: "Level 2 - Skill Passport Verified" };
  if (completed.has("profile_setup") && completed.has("aptitude_test") && completed.has("dsa_round")) {
    return { level: 1, label: "Level 1 - Cognitive Verified" };
  }
  return { level: 0, label: "Level 0 - Not Yet Certified" };
};

const JobSeekerDashboard = () => {
  const { user, completeGoogleSignUpRole, isInitializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [savedJobs, setSavedJobs] = useState<any[]>([]);
  const [verificationStages, setVerificationStages] = useState<any[]>([]);
  const [certificationLevelNumber, setCertificationLevelNumber] = useState<number>(0);
  const [certificationLabel, setCertificationLabel] = useState<string>("Level 0 - Not Yet Certified");
  const [testResults, setTestResults] = useState<{ aptitude: any; dsa: any }>({ aptitude: null, dsa: null });
  const [certificationLevel, setCertificationLevel] = useState<"A" | "B" | "C" | null>(null);
  const [provenhireCertCode, setProvenhireCertCode] = useState<"L1" | "L2" | "L3" | null>(null);
  const [provenhireCertSubtitle, setProvenhireCertSubtitle] = useState<string | null>(null);
  const [stats, setStats] = useState({
    applicationsSent: 0,
    interviews: 0,
    profileViews: 0,
  });
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [dashboardSection, setDashboardSection] = useState<'candidate' | 'passport' | 'resume' | 'applications'>('candidate');
  const appliedAndRefetchedRef = useRef(false);
  /** Invalidate in-flight dashboard fetches on unmount or user change — prevents 401 cascades + Sonner/DOM errors */
  const dashboardFetchGenRef = useRef(0);
  const [resumeProfile, setResumeProfile] = useState<CandidateProfileViewProfile | null>(null);
  /** Technical: admin review + human interview payment gate */
  const [humanInterviewGate, setHumanInterviewGate] = useState<{
    admin_review_status: string;
    requires_payment: boolean;
    can_access_slots: boolean;
    can_access_payment_page: boolean;
    block_human_interview_section: boolean;
    payment_status: string;
  } | null>(null);
  const [resumeProfileLoading, setResumeProfileLoading] = useState(false);
  const showJobTitleModal = Boolean(
    !loading &&
    profile &&
    !(profile.targetJobTitle ?? profile.target_job_title)?.trim()
  );
  const roleType = (profile?.roleType ?? profile?.role_type ?? "technical") as "technical" | "non_technical";
  const stageOrder = roleType === "non_technical" ? [...NON_TECHNICAL_STAGE_ORDER] : [...TECHNICAL_STAGE_ORDER];

  /** Highest completed stage for Skill Passport progressive display */
  const completedUpToStage = (() => {
    if (!verificationStages.length) return null;
    const completed = verificationStages.filter((s: { status?: string }) => s.status === "completed");
    if (roleType === "technical") {
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "human_expert_interview")) return "expert";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "expert_interview")) return "ai_interview";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "dsa_round")) return "dsa";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "aptitude_test")) return "aptitude";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "profile_setup")) return "profile";
    } else {
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "expert_interview")) return "expert";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "non_tech_assignment")) return "assignment";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "profile_setup")) return "profile";
    }
    return null;
  })();

  const getStageStatus = (stageName: string): 'done' | 'active' | 'locked' => {
    const stage = verificationStages.find((s: any) => s.stage_name === stageName);
    const idx = stageOrder.indexOf(stageName);
    const allPrevCompleted = idx <= 0 || stageOrder.slice(0, idx).every((prev) =>
      verificationStages.some((s: any) => s.stage_name === prev && s.status === 'completed')
    );
    if (!stage) {
      return allPrevCompleted ? 'active' : idx === 0 ? 'active' : 'locked';
    }
    if (stage.status === 'pending_review') return 'locked';
    if (stage.status === 'completed') return 'done';
    if (stage.status === 'in_progress' || stage.status === 'failed') return 'active';
    // Locked but all previous completed = next to do, show Start button
    return allPrevCompleted ? 'active' : 'locked';
  };

  const activeStageIndex = stageOrder.findIndex((s) => getStageStatus(s) === 'active');
  const nextStageLabel = activeStageIndex >= 0 && activeStageIndex < stageOrder.length
    ? STAGE_LABELS[stageOrder[activeStageIndex]]
    : 'Verification';

  const levelBlueprint =
    roleType === "non_technical"
      ? [
          {
            level: 1,
            label: "Level 1 - Assignment Verified",
            stages: ["profile_setup", "non_tech_assignment"],
          },
          {
            level: 2,
            label: "Level 2 - Expert Verified",
            stages: ["human_expert_interview"],
          },
        ]
      : [
          {
            level: 1,
            label: "Level 1 - Cognitive Verified",
            stages: ["profile_setup", "aptitude_test", "dsa_round"],
          },
          {
            level: 2,
            label: "Level 2 - Skill Passport",
            stages: ["expert_interview"],
          },
          {
            level: 3,
            label: "Level 3 - Elite Verified",
            stages: ["human_expert_interview"],
          },
        ];

  const {
 
    isVerified, 
    verificationProgress: gateProgress, 
    currentStage,
    requiresVerification 
  } = useVerificationGate();

  const profileChecklist = [
    {
      label: "Personal details",
      done: Boolean((profile?.fullName ?? profile?.full_name) && profile?.phone && profile?.location),
    },
    {
      label: "Education",
      done: Boolean((profile?.college || profile?.graduationYear || profile?.graduation_year)),
    },
    {
      label: "Skills",
      done: Boolean(profile?.skills && (Array.isArray(profile.skills) ? profile.skills.length > 0 : true)),
    },
  ];
  const profileCompletion = profileChecklist.length
    ? Math.round(
        (profileChecklist.filter((item) => item.done).length / profileChecklist.length) * 100
      )
    : 0;
  const handleRestrictedAction = () => {
    if (requiresVerification()) {
      setShowVerificationDialog(true);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (isInitializing || !user) {
      if (!user) {
        setLoading(false);
        setProfile(null);
        setApplications([]);
        setSavedJobs([]);
        setVerificationStages([]);
        setTestResults({ aptitude: null, dsa: null });
      }
      return;
    }
    if (!hasAuthToken()) {
      setLoading(false);
      return;
    }
    const gen = ++dashboardFetchGenRef.current;
    const stale = () => gen !== dashboardFetchGenRef.current;
    setLoading(true);
    setLoadError(false);
    void loadDashboardData(stale);
    return () => {
      dashboardFetchGenRef.current += 1;
    };
  }, [user?.id, isInitializing]);

  // Load candidate-profile (same shape as recruiters see) when user opens My Resume tab
  useEffect(() => {
    if (!user || dashboardSection !== "resume") return;
    setResumeProfileLoading(true);
    api
      .get<{ profile: CandidateProfileViewProfile }>("/api/users/me/candidate-profile")
      .then((r) => setResumeProfile(r.profile))
      .catch(() => setResumeProfile(null))
      .finally(() => setResumeProfileLoading(false));
  }, [user, dashboardSection]);

  // Open Applications tab when navigating from Jobs page after apply; refetch so new application appears
  useEffect(() => {
    const section = (location.state as { section?: string } | null)?.section;
    if (section === 'applications' && user) {
      setDashboardSection('applications');
      appliedAndRefetchedRef.current = true;
      (async () => {
        try {
          await new Promise(r => setTimeout(r, 150));
          const [appsRes, savedRes] = await Promise.all([
            api.get<{ applications: any[] }>("/api/jobs/me/applications"),
            api.get<{ saved: any[] }>("/api/jobs/me/saved"),
          ]);
          const applicationsList = Array.isArray(appsRes?.applications) ? appsRes.applications : [];
          const savedList = Array.isArray(savedRes?.saved) ? savedRes.saved : [];
          setApplications(applicationsList);
          setSavedJobs(savedList);
          setStats(prev => ({ ...prev, applicationsSent: applicationsList.length }));
        } catch (e) {
          console.warn("[JobSeekerDashboard] refetch applications/saved failed", e);
        }
        finally {
          navigate(location.pathname, { replace: true, state: {} });
          setTimeout(() => { appliedAndRefetchedRef.current = false; }, 500);
        }
      })();
    }
  }, [location.state, user, navigate, location.pathname]);

  // Preload Verification flow chunk so /verification opens fast when user clicks
  useEffect(() => {
    const id = setTimeout(() => preloadVerificationFlow(), 300);
    return () => clearTimeout(id);
  }, []);

  const loadDashboardData = async (stale: () => boolean) => {
    if (stale()) return;
    if (!hasAuthToken()) {
      setLoading(false);
      return;
    }
    try {
      // Phase 1 (critical): render quickly with profile + stage pipeline.
      // Phase 2 (secondary): load applications/saved/results in background.
      const [profileRes, stagesRes] = await Promise.allSettled([
        api.get<{ profile: any }>("/api/users/job-seeker-profile"),
        api.get<{
          stages: any[];
          certification_level?: number;
          certification_label?: string;
          certificationLevel?: "L1" | "L2" | "L3" | null;
          certificationLabelShort?: string | null;
        }>("/api/verification/stages"),
      ]);

      if (stale()) return;

      const profileData = profileRes.status === "fulfilled" ? profileRes.value : null;
      const stagesData = stagesRes.status === "fulfilled" ? stagesRes.value : null;
      const profile = profileData?.profile ?? null;
      const stagesList = Array.isArray(stagesData?.stages) ? stagesData.stages : [];
      const role = (profile?.roleType ?? profile?.role_type ?? "technical") as "technical" | "non_technical";
      const derivedCertification = deriveCertificationFromStages(role, stagesList);
      const apiLevel = stagesData?.certification_level ?? 0;
      const apiLabel = stagesData?.certification_label ?? "Level 0 - Not Yet Certified";
      /** Certification ladder comes from the API (same logic as admin/recruiters). Fallback only if stages request failed. */
      const stagesOk = stagesRes.status === "fulfilled";
      const effectiveLevel = stagesOk ? apiLevel : derivedCertification.level;
      const effectiveLabel = stagesOk ? apiLabel : derivedCertification.label;
      setCertificationLevelNumber(effectiveLevel);
      setCertificationLabel(effectiveLabel);
      const code = stagesOk ? stagesData?.certificationLevel ?? null : null;
      setProvenhireCertCode(
        code === "L1" || code === "L2" || code === "L3"
          ? code
          : !stagesOk && derivedCertification.level >= 1
            ? derivedCertification.level === 3
              ? "L3"
              : derivedCertification.level === 2
                ? "L2"
                : "L1"
            : null
      );
      setProvenhireCertSubtitle(
        stagesOk && typeof stagesData?.certificationLabelShort === "string"
          ? stagesData.certificationLabelShort
          : null
      );

      const criticalError = profileRes.status === "rejected" || stagesRes.status === "rejected";
      setLoadError(criticalError);
      if (criticalError) {
        const reason = profileRes.status === "rejected" ? profileRes.reason : stagesRes.reason;
        const status = reason?.status;
        const msg = reason instanceof Error ? reason.message : "";
        const is503 =
          status === 503 ||
          msg.includes("Service unavailable") ||
          msg.includes("temporarily unavailable") ||
          msg.includes("Backend not running") ||
          msg.includes("npm run dev");
        void is503; // Inline banner (loadError) covers backend issues; avoid disruptive toasts on dashboard.
      }

      if (profile) {
        setProfile(profile);
      } else {
        setProfile(null);
      }
      if (stale()) return;

      setVerificationStages(stagesList);
      setStats({
        applicationsSent: 0,
        interviews: 0,
        profileViews: profile?.profileViews ?? 0,
      });

      if ((profile?.roleType ?? profile?.role_type ?? "technical") === "technical" && !stale()) {
        try {
          const g = await api.get<{
            admin_review_status: string;
            requires_payment: boolean;
            can_access_slots: boolean;
            can_access_payment_page: boolean;
            block_human_interview_section: boolean;
            payment_status: string;
          }>("/api/human-interview/eligibility");
          if (!stale()) setHumanInterviewGate(g);
        } catch {
          if (!stale()) setHumanInterviewGate(null);
        }
      } else if (!stale()) {
        setHumanInterviewGate(null);
      }

      if (stagesList.length > 0) {
        const completed = stagesList.filter((s: { status?: string }) => s.status === 'completed').length;
        const role = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
        const total = role === "non_technical" ? 3 : 5;
        setVerificationProgress((completed / total) * 100);
      }

      if (stale()) return;

      setLoading(false);

      // Phase 2 (non-blocking): load secondary data and enrich dashboard.
      const secondary = await Promise.allSettled([
        api.get<{ applications: any[] }>("/api/jobs/me/applications"),
        api.get<{ saved: any[] }>("/api/jobs/me/saved"),
        api.get<{ result: any }>("/api/verification/aptitude/latest"),
        api.get<{ result: any }>("/api/verification/dsa/latest"),
      ]);

      const applicationsData = secondary[0].status === "fulfilled" ? secondary[0].value : null;
      const savedJobsData = secondary[1].status === "fulfilled" ? secondary[1].value : null;
      const aptitudeData = secondary[2].status === "fulfilled" ? secondary[2].value : null;
      const dsaData = secondary[3].status === "fulfilled" ? secondary[3].value : null;

      if (stale()) return;

      const secondaryError = secondary.some((r) => r.status === "rejected");
      if (secondaryError) {
        setLoadError(true);
      }

      const applicationsList = Array.isArray(applicationsData?.applications) ? applicationsData.applications : [];
      const savedList = Array.isArray(savedJobsData?.saved) ? savedJobsData.saved : [];
      const aptitudeResult = aptitudeData?.result ?? null;
      const dsaResult = dsaData?.result ?? null;

      if (!appliedAndRefetchedRef.current) {
        setApplications(applicationsList);
        setSavedJobs(savedList);
      }
      setTestResults({ aptitude: aptitudeResult, dsa: dsaResult });
      setStats({
        applicationsSent: applicationsList.length,
        interviews: applicationsList.filter((a: { status?: string }) => a.status === "interview_scheduled").length,
        profileViews: profile?.profileViews ?? 0,
      });

      if (profile?.verificationStatus === "expert_verified" || profile?.verificationStatus === "verified") {
        const role = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
        const interviewStage = stagesList.find((s: { stage_name?: string }) => s.stage_name === "expert_interview");
        const interviewScore = interviewStage?.score ?? 0;
        if (role === "non_technical") {
          const pct = Math.round(Number(interviewScore) || 0); // expert_interview score is already 0–100
          if (pct >= 80) setCertificationLevel("A");
          else if (pct >= 60) setCertificationLevel("B");
          else setCertificationLevel("C");
        } else {
          const aptScore = aptitudeResult?.total_score ?? 0;
          const aptTotal = aptitudeResult?.total_marks ?? (aptitudeResult?.answers as { totalMarks?: number })?.totalMarks ?? 0;
          const aptitudePct =
            typeof aptitudeResult?.percentage === "number"
              ? aptitudeResult.percentage
              : aptTotal > 0
                ? (aptScore / aptTotal) * 100
                : 0;
          const dsaPct = dsaResult?.total_score ?? 0; // already 0–100
          const interviewPct = Number(interviewScore) || 0; // expert_interview score is already 0–100
          const overallAvg = (aptitudePct + dsaPct + interviewPct) / 3;
          if (overallAvg >= 80) setCertificationLevel("A");
          else if (overallAvg >= 60) setCertificationLevel("B");
          else setCertificationLevel("C");
        }
      }
    } catch (error: unknown) {
      if (stale()) return;
      console.error('Error loading dashboard data:', error);
      setLoadError(true);
      const err = error as Error & { status?: number; isBackendUnavailable?: boolean };
      const msg = err.message || 'Failed to load dashboard';
      const isUnavailable = err.isBackendUnavailable === true || err.status === 503 || msg.includes("Service unavailable") || msg.includes("npm run dev");
      void isUnavailable; // Inline banner (loadError) covers backend issues; avoid disruptive toasts on dashboard.
      setLoading(false);
    }
  };

  const handleRemoveSavedJob = async (savedJobId: string, jobId: string) => {
    try {
      await api.del(`/api/jobs/${jobId}/save`);

      setSavedJobs(prev => prev.filter(j => j.id !== savedJobId));
      toast.success('Job removed from saved');
    } catch (error: any) {
      console.error('Error removing saved job:', error);
      toast.error('Failed to remove saved job');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      'applied': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'reviewing': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      'interview_scheduled': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      'rejected': 'bg-red-500/20 text-red-300 border-red-500/30',
      'hired': 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40',
    };
    return statusColors[status] || 'bg-white/10 text-gray-300 border-white/10';
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <Lock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const statsDisplay = [
    { label: "Applications Sent", value: stats.applicationsSent.toString(), icon: Briefcase, color: "text-primary" },
    { label: "Interviews", value: stats.interviews.toString(), icon: TrendingUp, color: "text-accent" },
    { label: "Profile Views", value: stats.profileViews.toString(), icon: Eye, color: "text-secondary-foreground" },
  ];

  const sidebarSections: import("@/components/DashboardShell").DashboardSidebarSection[] = [
    {
      sectionLabel: "Candidate",
      items: [
        { label: "Verification Pipeline", onClick: () => setDashboardSection('candidate'), active: dashboardSection === 'candidate', icon: <LayoutGrid className="w-[18px] h-[18px]" /> },
        { label: "Skill Passport", onClick: () => setDashboardSection('passport'), active: dashboardSection === 'passport', badge: isVerified ? "Active" : undefined, icon: <FileCheck className="w-[18px] h-[18px]" /> },
        { label: "My Resume", onClick: () => setDashboardSection('resume'), active: dashboardSection === 'resume', icon: <FileText className="w-[18px] h-[18px]" /> },
        { label: "Job Listings", to: "/jobs", icon: <Briefcase className="w-[18px] h-[18px]" /> },
        { label: "Applications", onClick: () => setDashboardSection('applications'), active: dashboardSection === 'applications', icon: <ListChecks className="w-[18px] h-[18px]" /> },
        { label: "Settings", to: "/dashboard/settings", icon: <Settings className="w-[18px] h-[18px]" /> },
      ],
    },
  ];

  const hasCompletedProfileSetup = Boolean((profile?.fullName ?? profile?.full_name)?.trim());
  const userName = (profile?.fullName ?? profile?.full_name) || user?.email?.split('@')[0] || 'Candidate';
  const { name: shellDisplayName, initials: userInitials } = jobSeekerShellUser(profile, user);

  return (
    <div className="min-h-screen">
      <JobTitleModal
        open={showJobTitleModal}
        roleType={roleType}
        onSave={(title) => {
          setProfile((p: any) => (p ? { ...p, targetJobTitle: title } : p));
        }}
      />
      <DashboardShell
        sidebarSections={sidebarSections}
        user={{ name: shellDisplayName, role: isVerified ? "Expert Verified ✦" : "Verification in progress", initials: userInitials }}
        onSignOut={undefined}
      >
        {loadError && (
          <div className="dashboard-section-content">
            <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <span>{BACKEND_DOWN_MSG}</span>
              <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-200 hover:bg-amber-500/20 shrink-0 ml-2" onClick={() => {
                  const gen = ++dashboardFetchGenRef.current;
                  setLoadError(false);
                  setLoading(true);
                  void loadDashboardData(() => gen !== dashboardFetchGenRef.current);
                }}>Retry</Button>
            </div>
          </div>
        )}
        {loading && (
          <div className="dashboard-section-content space-y-6">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <div className="dashboard-stages-grid">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        )}
        {!loading && dashboardSection === 'resume' && (
          <div className="dashboard-section-content">
            <div className="dashboard-section-header">
              <div>
                <h1>My Resume</h1>
                <p>Your full verified profile — same view recruiters see. Share on LinkedIn or use in job applications.</p>
              </div>
            </div>
            {resumeProfileLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
              </div>
            ) : resumeProfile ? (
              <CandidateProfileView profile={resumeProfile} variant="jobseeker" />
            ) : (
              <div className="rounded-xl border border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)] p-8 text-center text-[var(--dash-text-muted)]">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Complete your profile in Settings to see your full resume here.</p>
                <Button asChild className="mt-4 dashboard-btn-gold">
                  <Link to="/dashboard/settings">Go to Settings</Link>
                </Button>
              </div>
            )}
          </div>
        )}
        {!loading && dashboardSection === 'passport' && (
          <div className="dashboard-section-content">
            <div className="dashboard-section-header">
              <div>
                <h1>Skill Passport</h1>
                <p>Your verified, portable credential — accepted by all ProvenHire partner companies</p>
              </div>
            </div>
            {profile && (
              <SkillPassport
                certificationLevel={certificationLevel}
                skills={profile.skills || []}
                verificationStatus={profile.verificationStatus ?? profile.verification_status}
                roleType={roleType}
                completedUpToStage={completedUpToStage}
                aptitudeScore={testResults.aptitude ? (() => {
                  const t = testResults.aptitude.total_marks ?? 0;
                  if (typeof testResults.aptitude.percentage === "number") return testResults.aptitude.percentage;
                  const s = testResults.aptitude.total_score ?? 0;
                  return t > 0 ? Math.round((s / t) * 100) : Math.round(s);
                })() : undefined}
                dsaScore={testResults.dsa ? Math.round(testResults.dsa.total_score ?? 0) : undefined}
                interviewScore={verificationStages.find((s: any) => s.stage_name === 'expert_interview')?.score ? Math.round((verificationStages.find((s: any) => s.stage_name === 'expert_interview')?.score / 15) * 100) : undefined}
              />
            )}
          </div>
        )}
        {!loading && dashboardSection === 'applications' && (
          <div className="dashboard-section-content">
            <div className="dashboard-section-header flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1>Applications</h1>
                <p>Track your job applications and saved jobs</p>
              </div>
              <Button asChild className="dashboard-btn-gold shrink-0">
                <Link to="/jobs">Browse Jobs</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Your Applications</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{applications.length} total</Badge>
                      {applications.length > 0 && (
                        <Button variant="ghost" size="sm" className="text-primary h-8 px-2" asChild>
                          <Link to="/dashboard/jobseeker/applications">See All</Link>
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription>Track your job applications</CardDescription>
                </CardHeader>
                <CardContent>
                  {applications.length === 0 ? (
                    <div className="text-center py-8">
                      <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground mb-4">No applications yet. Start browsing jobs!</p>
                      <Button asChild className="dashboard-btn-gold"><Link to="/jobs">Browse Jobs</Link></Button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {applications.slice(0, 3).map((app) => {
                        const job = app.job ?? app.jobs;
                        const jobId = app.jobId ?? app.job_id ?? job?.id;
                        const status = app.status ?? 'applied';
                        return (
                          <div key={app.id} className="flex items-center justify-between gap-3 p-4 border border-[var(--dash-navy-border)] rounded-lg hover:bg-white/5 transition-colors">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold truncate text-white">{job?.title || 'Unknown Position'}</h3>
                              <p className="text-sm text-[var(--dash-text-muted)]">{job?.company || 'Unknown Company'}</p>
                              <p className="text-sm text-[var(--dash-text-muted)] mt-1">
                                Applied {new Date(app.appliedAt ?? app.applied_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={getStatusBadge(status)}>{(status as string).replace(/_/g, ' ')}</Badge>
                              {jobId && (
                                <Button asChild className="dashboard-btn-ghost" size="sm">
                                  <Link to={`/jobs?jobId=${jobId}`}><Eye className="h-4 w-4" /></Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {applications.length > 3 && (
                        <div className="pt-2 border-t border-border">
                          <Button variant="ghost" size="sm" className="w-full text-primary" asChild>
                            <Link to="/dashboard/jobseeker/applications">See All ({applications.length})</Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Saved Jobs</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{savedJobs.length} saved</Badge>
                      {savedJobs.length > 0 && (
                        <Button variant="ghost" size="sm" className="text-primary h-8 px-2" asChild>
                          <Link to="/dashboard/jobseeker/saved">See All</Link>
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription>Jobs you've bookmarked for later</CardDescription>
                </CardHeader>
                <CardContent>
                  {savedJobs.length === 0 ? (
                    <div className="text-center py-8">
                      <BookmarkCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground mb-4">No saved jobs yet.</p>
                      <Button asChild className="dashboard-btn-gold"><Link to="/jobs">Browse Jobs</Link></Button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {savedJobs.slice(0, 3).map((saved) => {
                        const job = saved.job ?? saved.jobs;
                        const jobId = saved.jobId ?? saved.job_id ?? job?.id;
                        return (
                          <div key={saved.id} className="flex items-center justify-between gap-3 p-4 border border-[var(--dash-navy-border)] rounded-lg hover:bg-white/5 transition-colors">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold truncate text-white">{job?.title || 'Unknown Position'}</h3>
                              <p className="text-sm text-[var(--dash-text-muted)]">{job?.company || 'Unknown Company'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {jobId ? (
                                <Button asChild className="dashboard-btn-ghost" size="sm">
                                  <Link to={`/jobs?jobId=${jobId}`}><ExternalLink className="h-4 w-4" /></Link>
                                </Button>
                              ) : (
                                <Button asChild className="dashboard-btn-ghost" size="sm">
                                  <Link to="/jobs"><ExternalLink className="h-4 w-4" /></Link>
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleRemoveSavedJob(saved.id, saved.jobId ?? saved.job_id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        );
                      })}
                      {savedJobs.length > 3 && (
                        <div className="pt-2 border-t border-border">
                          <Button variant="ghost" size="sm" className="w-full text-primary" asChild>
                            <Link to="/dashboard/jobseeker/saved">See All ({savedJobs.length})</Link>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        {!loading && dashboardSection === 'candidate' && (
          <div className="dashboard-candidate-section">
            <div className="dashboard-section-header flex-wrap gap-4">
              <div className="section-header-left">
                <h1>Verification Pipeline</h1>
                <p>
                  {roleType === "non_technical"
                    ? "Complete all 3 stages to unlock your Skill Passport and access premium opportunities"
                    : "Complete all 5 stages to unlock your Skill Passport and access premium opportunities"}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="dashboard-proc-indicator">
                  <span className="dashboard-rec-dot" />
                  Session Proctored
                </span>
                {certificationLevelNumber >= 1 && (
                  <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-400/40">
                    <Award className="h-3.5 w-3.5 mr-1.5" />
                    {roleType === "technical" ? "Cognitive Verified Badge Earned" : "Assignment Verified Badge Earned"}
                  </Badge>
                )}
                <Button className="dashboard-btn-gold" onClick={() => navigate('/verification')}>
                  Continue {nextStageLabel} →
                </Button>
              </div>
            </div>
            <div className="dashboard-section-content">
              <div
                className={`grid gap-3 mb-6 ${roleType === "technical" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
              >
                {(roleType === "technical" ? (["L1", "L2", "L3"] as const) : (["L1", "L2"] as const)).map((code, idx) => {
                  const step = idx + 1;
                  const activeByNumber = certificationLevelNumber >= step;
                  const activeByCode = provenhireCertCode === code;
                  const highlight = activeByCode || (provenhireCertCode == null && activeByNumber);
                  const titles: Record<string, string> =
                    roleType === "technical"
                      ? { L1: "Cognitive Verified", L2: "Skill Passport", L3: "Elite Verified" }
                      : { L1: "Assignment Verified", L2: "Expert Verified" };
                  return (
                    <div
                      key={code}
                      className={`rounded-xl border p-4 transition-colors ${
                        highlight
                          ? "border-emerald-400/50 bg-emerald-500/10"
                          : "border-[var(--dash-navy-border)] opacity-80"
                      }`}
                    >
                      <div className="text-xs font-semibold text-emerald-300/90">{code}</div>
                      <div className="text-sm font-medium text-white mt-1">{titles[code]}</div>
                      {highlight && provenhireCertSubtitle ? (
                        <p className="text-xs text-[var(--dash-text-muted)] mt-2 leading-snug">{provenhireCertSubtitle}</p>
                      ) : (
                        <p className="text-xs text-[var(--dash-text-muted)] mt-2 leading-snug">
                          {roleType === "technical"
                            ? code === "L1"
                              ? "Profile + Cognitive Assessment"
                              : code === "L2"
                                ? "DSA + AI Interview"
                                : "Human Expert Interview"
                            : code === "L1"
                              ? "Profile + Assignment"
                              : "Human Expert Interview"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="dashboard-stage-header-card">
                <div className="flex justify-between items-start flex-wrap gap-4 mb-7">
                  <div>
                    <div className="dashboard-stage-greeting">{hasCompletedProfileSetup ? "Welcome back," : "Welcome"}</div>
                    {hasCompletedProfileSetup && (
                      <>
                        <div className="dashboard-stage-name">{userName.split(' ')[0]} <span>{userName.split(' ').slice(1).join(' ') || ''}</span></div>
                        <div className="flex items-center gap-2 mt-2 text-base font-medium text-white/60">
                          <span>{profile?.currentRole ?? profile?.current_role ?? profile?.current_company ?? 'Candidate'}</span>
                          {isVerified && <><span style={{ width: 4, height: 4, background: 'var(--dash-gold)', borderRadius: '50%', display: 'inline-block' }} /><span>Expert Verified Path</span></>}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="dashboard-stage-time-badge">
                    <div className="dashboard-stage-time-label">Time to full verify</div>
                    <div className="dashboard-stage-time-value">≤ 48h</div>
                    <div className="dashboard-stage-time-label mt-1">
                      Complete all {roleType === "non_technical" ? 3 : 5} stages
                    </div>
                  </div>
                </div>
                <div className="dashboard-stage-progress-bar">
                  {stageOrder.map((stageName, idx) => {
                    const status = getStageStatus(stageName);
                    return (
                      <div key={stageName} className={`dashboard-stage-progress-step ${status}`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className={`dashboard-stage-dot ${status}`}>
                            {status === 'done' ? '✓' : idx + 1}
                          </div>
                          <div className="dashboard-stage-dot-label">{STAGE_LABELS[stageName]}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="dashboard-stages-grid">
                {(roleType === "technical" ? stageOrder.filter((s) => s !== "human_expert_interview") : stageOrder).map((stageName, idx) => {
                  const stageData = verificationStages.find((s: any) => s.stage_name === stageName);
                  const status = getStageStatus(stageName);
                  const isCompleted = status === 'done';
                  const isActive = status === 'active';
                  const isLocked = status === 'locked';
                  const isFailed = stageData?.status === 'failed';
                  const aptitudeScore = testResults.aptitude?.total_score ?? 0;
                  const aptitudeTotal = testResults.aptitude?.total_marks ?? 0;
                  const aptitudePct =
                    testResults.aptitude && typeof testResults.aptitude.percentage === "number"
                      ? testResults.aptitude.percentage
                      : testResults.aptitude && aptitudeTotal > 0
                        ? Math.round((aptitudeScore / aptitudeTotal) * 100)
                        : null;
                  const aptitudeDisplay = testResults.aptitude
                    ? aptitudeTotal > 0
                      ? `${aptitudeScore}/${aptitudeTotal} (${aptitudePct ?? 0}%)`
                      : `${aptitudePct ?? 0}%`
                    : null;
                  const dsaSolved = testResults.dsa ? `${testResults.dsa.problems_solved || 0}/${testResults.dsa.total_problems || 3}` : null;
                  const dsaPct = testResults.dsa ? Math.round(testResults.dsa.total_score ?? 0) : null;
                  const stageDesc: Record<string, string> = {
                    profile_setup: 'AI-assisted profile creation with resume parsing and consistency checks.',
                    aptitude_test:
                      'Proctored Cognitive Assessment: reasoning, quantitative, and verbal items; CS fundamentals for mid/senior bands.',
                    dsa_round: 'Proctored coding round with 2–4 algorithmic problems of increasing difficulty.',
                    non_tech_assignment: 'Role-based written assignment tailored to your target job title.',
                    expert_interview: 'Adaptive AI video interview. Questions generated from your resume, role, and experience level.',
                    human_expert_interview: 'Live interview with a domain expert. Final stage for role verification and approval.',
                  };
                  return (
                    <div
                      key={stageName}
                      className={`dashboard-stage-card ${isCompleted ? 'completed' : ''} ${isActive ? 'active-stage' : ''} ${isLocked ? 'locked-stage' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className={`dashboard-stage-num ${isCompleted ? 'done-num' : isActive ? 'active-num' : 'locked-num'}`}>
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                        <div className={`flex items-center gap-1.5 dashboard-stage-pill px-3 py-1.5 rounded-[20px] ${isCompleted ? 'dashboard-pill-verified' : isActive ? 'dashboard-pill-active' : 'dashboard-pill-locked'}`}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          {isCompleted ? 'Verified' : isActive ? 'In Progress' : 'Locked'}
                        </div>
                      </div>
                      <h3 className="dashboard-stage-card-title">{STAGE_LABELS[stageName]}</h3>
                      <p className="dashboard-stage-card-desc">{stageDesc[stageName] ?? ''}</p>
                      <div className="flex flex-wrap gap-1">
                        {stageName === 'profile_setup' && <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> AI Parsed</span>}
                        {stageName === 'aptitude_test' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Proctored</span><span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Webcam Active</span></>}
                        {stageName === 'dsa_round' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Proctored</span><span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Sandbox Executed</span></>}
                        {stageName === 'non_tech_assignment' && <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Job-Specific</span>}
                        {stageName === 'expert_interview' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Recording Active</span><span className="dashboard-trust-chip"><span style={{ background: 'var(--dash-gold)' }} className="w-1.5 h-1.5 rounded-full" /> AI Adaptive</span></>}
                        {stageName === 'human_expert_interview' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Live Recorded</span><span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Expert Panel</span></>}
                      </div>
                      {isCompleted && stageName === 'profile_setup' && <div className="mt-3 text-sm font-semibold text-[var(--dash-text-muted)]">✓ Completed</div>}
                      {isCompleted && stageName === 'aptitude_test' && aptitudeDisplay && (
                        <><div className="dashboard-score-bar"><div className="dashboard-score-fill" style={{ width: `${aptitudePct ?? 0}%` }} /></div><div className="dashboard-score-text">Score: {aptitudeDisplay}</div></>
                      )}
                      {isCompleted && stageName === 'dsa_round' && dsaSolved && (
                        <><div className="dashboard-score-bar"><div className="dashboard-score-fill" style={{ width: `${dsaPct ?? 0}%` }} /></div><div className="dashboard-score-text">{dsaSolved} Problems Solved{dsaPct != null ? ` (${dsaPct}%)` : ''}</div></>
                      )}
                      {isCompleted && stageName === 'non_tech_assignment' && <div className="dashboard-score-text">Score: {stageData?.score ?? 0}/100</div>}
                      {stageName === 'expert_interview' && stageData?.status === 'pending_review' && (
                        <div className="mt-3 text-sm font-semibold text-amber-600">Under review — expect an email in 10–15 hours</div>
                      )}
                      {isCompleted && stageName === 'expert_interview' && <div className="dashboard-score-text">Certified Level {certificationLevel || '—'}</div>}
                      {isCompleted && stageName === 'human_expert_interview' && <div className="mt-3 text-sm font-semibold text-[var(--dash-text-muted)]">✓ Completed</div>}
                      {isActive && (
                        <Button className="dashboard-btn-gold w-full mt-4 py-3" onClick={() => navigate('/verification')}>
                          {isFailed ? `Retry ${STAGE_LABELS[stageName]} →` : `Start ${STAGE_LABELS[stageName]} →`}
                        </Button>
                      )}
                    </div>
                  );
                })}

                {roleType === 'technical' && (() => {
                  const showHumanExpertCta =
                    getStageStatus('human_expert_interview') === 'active' ||
                    (humanInterviewGate &&
                      (humanInterviewGate.can_access_payment_page || humanInterviewGate.can_access_slots));
                  const humanPillActive = getStageStatus('human_expert_interview') === 'active' || !!showHumanExpertCta;
                  return (
                <div className={`dashboard-stage-card full-width ${humanPillActive ? 'active-stage' : 'locked-stage'}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`dashboard-stage-num ${humanPillActive ? 'active-num' : 'locked-num'}`}>05</div>
                    <div className={`flex items-center gap-1.5 dashboard-stage-pill px-3 py-1.5 rounded-[20px] ${humanPillActive ? 'dashboard-pill-active' : 'dashboard-pill-locked'}`}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: humanPillActive ? 'var(--dash-gold)' : 'var(--dash-text-muted)' }} />
                      {humanInterviewGate?.admin_review_status === 'pending'
                        ? 'Awaiting admin review'
                        : humanInterviewGate?.requires_payment || humanInterviewGate?.payment_status === 'pending'
                          ? 'Payment required'
                          : humanPillActive
                            ? 'In Progress'
                            : 'Locked'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 items-start">
                    <div>
                      <h3 className="dashboard-stage-card-title">Human Expert Interview</h3>
                      <p className="dashboard-stage-card-desc">
                        30–45 min live video interview with a domain expert (5+ yrs experience). NDA signed. Cannot be gamed by coaching or scripted answers.
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Live Recorded</span>
                        <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> ID Verified</span>
                        <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> NDA Expert</span>
                      </div>
                      {showHumanExpertCta && (
                        <Button
                          className="dashboard-btn-gold w-full mt-4 py-3"
                          onClick={() => {
                            if (humanInterviewGate?.can_access_payment_page) {
                              navigate('/human-interview/payment');
                              return;
                            }
                            if (humanInterviewGate?.can_access_slots) {
                              navigate('/human-interview/slots');
                              return;
                            }
                            navigate('/verification');
                          }}
                        >
                          {humanInterviewGate?.can_access_payment_page
                            ? 'Pay ₹399 — Human interview →'
                            : humanInterviewGate?.can_access_slots
                              ? 'Book your interview slot →'
                              : verificationStages.find((s: any) => s.stage_name === 'human_expert_interview')?.status === 'failed'
                                ? 'Retry Human Expert Interview →'
                                : 'Start Human Expert Interview →'}
                        </Button>
                      )}
                    </div>
                    <div className="rounded-xl p-4 bg-white/5 border border-[var(--dash-navy-border)]">
                      <div className="text-sm font-semibold uppercase tracking-wide text-[var(--dash-text-muted)] mb-2">Slot availability (after Stage 4)</div>
                      <div className="text-base font-bold text-[var(--dash-gold)]">Within 4–12 hours</div>
                      <div className="text-sm text-[var(--dash-text-muted)] mt-1">8 active experts · Morning, Evening & Weekend slots</div>
                    </div>
                  </div>
                </div>
                  );
                })()}
              </div>
              {roleType === "technical" && (
                <VerificationPipelineCard
                  verificationStages={verificationStages}
                  roleType={roleType}
                  certificationLevelNumber={certificationLevelNumber}
                  certificationLabel={certificationLabel}
                  userName={userName}
                  profile={profile}
                  getStageStatus={getStageStatus}
                  nextStageLabel={nextStageLabel}
                />
              )}
            </div>
          </div>
        )}
      </DashboardShell>

      {/* Verification Gate Dialog */}
      <VerificationGateDialog
        open={showVerificationDialog}
        onOpenChange={setShowVerificationDialog}
        verificationProgress={gateProgress}
        currentStage={currentStage}
      />
    </div>
  );
};

export default JobSeekerDashboard;
