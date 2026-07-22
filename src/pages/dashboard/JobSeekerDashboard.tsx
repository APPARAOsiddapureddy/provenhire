import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, CheckCircle, Clock, TrendingUp, Award, Eye, FileText, BookmarkCheck, Trash2, ExternalLink, User, Lock, ShieldAlert } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { api, BACKEND_DOWN_MSG, hasAuthToken } from "@/lib/api";
import { isDevDashboardPreviewMode } from "@/lib/devPreview";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import SkillPassport from "@/components/SkillPassport";
import CandidateProfileView, { type CandidateProfileViewProfile } from "@/components/CandidateProfileView";
import { VerificationPipelineCard } from "@/components/VerificationPipelineCard";
import ReferAFriend from "@/components/ReferAFriend";
import VerificationGateDialog from "@/components/VerificationGateDialog";
import JobTitleModal from "@/components/JobTitleModal";
import { useVerificationGate } from "@/hooks/useVerificationGate";
import { useJobSeekerWorkspaceMembership } from "@/hooks/useJobSeekerWorkspaceMembership";
import { Skeleton } from "@/components/ui/skeleton";
import { preloadVerificationFlow } from "@/preloads";
import DashboardShell from "@/components/DashboardShell";
import { jobSeekerShellUser } from "@/utils/jobSeekerIdentity";
import { buildJobSeekerSidebarSections, type JobSeekerDashboardSection, type JobSeekerSidebarActiveItem } from "@/utils/jobSeekerSidebar";

const TECHNICAL_STAGE_ORDER = ['profile_setup', 'dsa_round', 'expert_interview'] as const;

function nonTechnicalFallbackOrder(experienceYears: number | null | undefined): string[] {
  const y = experienceYears == null || Number.isNaN(Number(experienceYears)) ? 0 : Number(experienceYears);
  if (y < 3) {
    return ['profile_setup', 'domain_fundamentals', 'non_tech_assignment', 'expert_interview'];
  }
  return ['profile_setup', 'non_tech_assignment', 'expert_interview'];
}

/** When GET /verification/stages has not yet returned `stage_order`, align with server `dataStagesForTier`. */
function dataTrackFallbackOrder(experienceYears: number | null | undefined): string[] {
  const y = experienceYears == null || Number.isNaN(Number(experienceYears)) ? 0 : Number(experienceYears);
  if (y < 1) {
    return ['profile_setup', 'data_fundamentals', 'data_round', 'data_skills_interview', 'expert_interview'];
  }
  return ['profile_setup', 'data_round', 'data_skills_interview', 'data_system_design', 'expert_interview'];
}

const STAGE_LABELS: Record<string, string> = {
  profile_setup: 'Profile Setup',
  aptitude_test: 'Cognitive Assessment',
  cs_fundamentals: 'CS Fundamentals',
  domain_fundamentals: 'Domain Fundamentals',
  data_fundamentals: 'Data Fundamentals',
  dsa_round: 'DSA Round',
  data_round: 'Data Round',
  non_tech_assignment: 'Written assessment',
  ai_skills_interview: 'AI Skills Interview',
  data_skills_interview: 'AI Skills (Data)',
  system_design_interview: 'System Design',
  data_system_design: 'Data System Design',
  expert_interview: 'AI Expert Interview',
  human_expert_interview: 'Human Expert Interview',
};

const deriveCertificationFromStages = (
  roleType: "technical" | "non_technical" | "data",
  stages: Array<{ stage_name?: string; status?: string }>
): { level: number; label: string } => {
  const completed = new Set(
    stages.filter((s) => s.status === "completed").map((s) => s.stage_name).filter(Boolean) as string[]
  );
  if (roleType === "data") {
    if (completed.has("expert_interview")) {
      return { level: 3, label: "Level 3 - Elite Verified Candidate" };
    }
    const hasSkills = completed.has("data_skills_interview");
    const hasSd = completed.has("data_system_design");
    const midSeniorPipeline = stages.some((s) => s.stage_name === "data_system_design");
    if (midSeniorPipeline ? hasSkills && hasSd : hasSkills) {
      return { level: 2, label: "Level 2 - Skill Passport Verified" };
    }
    if (completed.has("data_round")) {
      return { level: 1, label: "Level 1 - Cognitive Verified" };
    }
    return { level: 0, label: "Level 0 - Not Yet Certified" };
  }
  if (roleType === "non_technical") {
    if (completed.has("expert_interview") || completed.has("human_expert_interview")) {
      return { level: 3, label: "Level 3 - AI Expert Verified Candidate" };
    }
    if (completed.has("non_tech_assignment")) {
      return { level: 2, label: "Level 2 - Assignment Verified Candidate" };
    }
    const needsDomain = stages.some((s) => s.stage_name === "domain_fundamentals");
    const domainOk = completed.has("domain_fundamentals");
    const profileOk = completed.has("profile_setup");
    if (profileOk && (!needsDomain || domainOk)) {
      return { level: 1, label: "Level 1 - Foundation Verified" };
    }
    return { level: 0, label: "Level 0 - Not Yet Certified" };
  }
  if (completed.has("expert_interview")) return { level: 2, label: "Level 2 - AI Interview Cleared" };
  if (completed.has("dsa_round")) {
    return { level: 1, label: "Level 1 - DSA Verified" };
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
  /** From GET /api/verification/stages — matches server pipeline (legacy vs v2, fresher vs mid/senior). */
  const [apiStageOrder, setApiStageOrder] = useState<string[] | null>(null);
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
  const [dashboardSection, setDashboardSection] = useState<JobSeekerDashboardSection>('candidate');
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
  /** v2: true until verification `profile_setup` is completed — server shows fresher stage order until then. */
  const [pipelinePendingProfileSetup, setPipelinePendingProfileSetup] = useState(false);
  const [resumeProfileLoading, setResumeProfileLoading] = useState(false);

  useEffect(() => {
    const requestedSection = (location.state as { section?: JobSeekerDashboardSection } | null)?.section;
    if (!requestedSection || !["candidate", "passport", "resume", "applications"].includes(requestedSection)) return;
    setDashboardSection(requestedSection);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);
  // Role-title modal is hidden for now; all jobseekers default to Full Stack Developer on the backend.
  const showJobTitleModal = false;
  const roleType = (profile?.roleType ?? profile?.role_type ?? "technical") as "technical" | "non_technical" | "data";
  const nonTechFallbackOrder = useMemo(
    () => nonTechnicalFallbackOrder(profile?.experienceYears ?? profile?.experience_years ?? null),
    [profile?.experienceYears, profile?.experience_years]
  );
  const dataFallbackOrder = useMemo(
    () => dataTrackFallbackOrder(profile?.experienceYears ?? profile?.experience_years ?? null),
    [profile?.experienceYears, profile?.experience_years]
  );
  const stageOrder = useMemo(() => {
    if (roleType === "non_technical") {
      if (apiStageOrder && apiStageOrder.length > 0) return [...apiStageOrder];
      return [...nonTechFallbackOrder];
    }
    if (roleType === "data") {
      if (apiStageOrder && apiStageOrder.length > 0) return [...apiStageOrder];
      return [...dataFallbackOrder];
    }
    if (apiStageOrder && apiStageOrder.length > 0) return [...apiStageOrder];
    return [...TECHNICAL_STAGE_ORDER];
  }, [roleType, apiStageOrder, nonTechFallbackOrder, dataFallbackOrder]);
  const nonTechHasDomainFundamentals = useMemo(
    () => roleType === "non_technical" && stageOrder.includes("domain_fundamentals"),
    [roleType, stageOrder]
  );

  const technicalStepsBeforeHuman = useMemo(
    () => stageOrder.filter((s) => s !== "human_expert_interview"),
    [stageOrder]
  );
  const humanStageStepNumber = useMemo(() => {
    const i = stageOrder.indexOf("human_expert_interview");
    return i >= 0 ? i + 1 : technicalStepsBeforeHuman.length + 1;
  }, [stageOrder, technicalStepsBeforeHuman.length]);

  /** Highest completed stage for Skill Passport progressive display */
  const completedUpToStage = (() => {
    if (!verificationStages.length) return null;
    const completed = verificationStages.filter((s: { status?: string }) => s.status === "completed");
    if (roleType === "data") {
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "expert_interview")) return "ai_interview";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "data_system_design")) return "system_design";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "data_skills_interview")) return "ai_skills";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "data_round")) return "dsa";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "data_fundamentals")) return "aptitude";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "profile_setup")) return "profile";
    } else if (roleType === "technical") {
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "human_expert_interview")) return "expert";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "expert_interview")) return "ai_interview";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "dsa_round")) return "dsa";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "profile_setup")) return "profile";
    } else {
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "expert_interview")) return "expert";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "non_tech_assignment")) return "assignment";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "domain_fundamentals")) return "domain";
      if (completed.some((s: { stage_name?: string }) => s.stage_name === "profile_setup")) return "profile";
    }
    return null;
  })();

  const getStageStatus = (stageName: string): 'done' | 'active' | 'locked' => {
    const stage = verificationStages.find((s: any) => s.stage_name === stageName);
    const idx = stageOrder.indexOf(stageName);
    const dsaStage = verificationStages.find((s: any) => s.stage_name === "dsa_round");
    const softwareExpertBlocked =
      roleType === "technical" &&
      stageName === "expert_interview" &&
      dsaStage?.status !== "completed";
    const allPrevCompleted = idx <= 0 || stageOrder.slice(0, idx).every((prev) =>
      verificationStages.some((s: any) => s.stage_name === prev && s.status === 'completed')
    );
    if (!stage) {
      return allPrevCompleted ? 'active' : idx === 0 ? 'active' : 'locked';
    }
    if (stage.status === 'pending_review') return 'locked';
    if (stage.status === 'completed') return 'done';
    if (softwareExpertBlocked) return 'locked';
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
            label: "Level 1 - Foundation",
            stages: ["profile_setup", "domain_fundamentals"],
          },
          {
            level: 2,
            label: "Level 2 - Assignment verified",
            stages: ["non_tech_assignment"],
          },
          {
            level: 3,
            label: "Level 3 - AI Expert",
            stages: ["expert_interview"],
          },
        ]
      : roleType === "data"
        ? [
            {
              level: 1,
              label: "Level 1 - Cognitive Verified",
              stages: ["profile_setup", "data_fundamentals", "data_round"],
            },
            {
              level: 2,
              label: "Level 2 - Skill Passport",
              stages: ["data_skills_interview", "data_system_design"],
            },
            {
              level: 3,
              label: "Level 3 - Elite Verified",
              stages: ["expert_interview"],
            },
          ]
        : [
            {
              level: 1,
              label: "Level 1 - DSA Verified",
              stages: ["dsa_round"],
            },
            {
              level: 2,
              label: "Level 2 - AI Interview Cleared",
              stages: ["expert_interview"],
            },
            {
              level: 3,
              label: "Level 3 - Reserved",
              stages: [],
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
    if (isDevDashboardPreviewMode() && user) {
      setLoading(false);
      setLoadError(false);
      return;
    }
    if (isInitializing || !user) {
      if (!user) {
        setLoading(false);
        setProfile(null);
        setApplications([]);
        setSavedJobs([]);
        setVerificationStages([]);
        setApiStageOrder(null);
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
    if (!user || dashboardSection !== "resume" || isDevDashboardPreviewMode()) return;
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
    if (section === 'applications' && user && !isDevDashboardPreviewMode()) {
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
    if (isDevDashboardPreviewMode()) {
      setLoading(false);
      return;
    }
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
          stage_order?: string[];
          verification_pipeline_v2?: boolean;
          pipeline_pending_profile_setup?: boolean;
        }>("/api/verification/stages"),
      ]);

      if (stale()) return;

      const profileData = profileRes.status === "fulfilled" ? profileRes.value : null;
      const stagesData = stagesRes.status === "fulfilled" ? stagesRes.value : null;
      const profile = profileData?.profile ?? null;
      const stagesList = Array.isArray(stagesData?.stages) ? stagesData.stages : [];
      const order = Array.isArray(stagesData?.stage_order) ? stagesData!.stage_order! : null;
      setApiStageOrder(order && order.length > 0 ? order : null);
      setPipelinePendingProfileSetup(Boolean(stagesData?.pipeline_pending_profile_setup));
      const role = (profile?.roleType ?? profile?.role_type ?? "technical") as "technical" | "non_technical" | "data";
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
        role === "technical"
          ? null
          : stagesOk && typeof stagesData?.certificationLabelShort === "string"
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

      if (false && (profile?.roleType ?? profile?.role_type ?? "technical") === "technical" && !stale()) {
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
        const role = (profile?.roleType ?? profile?.role_type ?? "technical") as string;
        const activeOrder =
          role === "non_technical"
            ? (order && order.length > 0 ? order : nonTechnicalFallbackOrder(profile?.experienceYears ?? profile?.experience_years ?? null))
            : role === "data"
              ? (order && order.length > 0 ? order : dataTrackFallbackOrder(profile?.experienceYears ?? profile?.experience_years ?? null))
              : order && order.length > 0
                ? order
                : [...TECHNICAL_STAGE_ORDER];
        const activeOrderList = Array.isArray(activeOrder) ? activeOrder : [];
        const activeNames = new Set(activeOrderList);
        const completed = stagesList.filter(
          (s: { stage_name?: string; status?: string }) => s.status === "completed" && activeNames.has(s.stage_name ?? "")
        ).length;
        const totalStages = activeOrderList.length;
        setVerificationProgress(totalStages > 0 ? Math.min(100, (completed / totalStages) * 100) : 0);
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

  const activeSidebarItem: JobSeekerSidebarActiveItem =
    dashboardSection === "candidate"
      ? "verification"
      : dashboardSection === "passport"
        ? "passport"
        : dashboardSection === "resume"
          ? "resume"
          : "applications";
  const { hasWorkspace, workspaceName } = useJobSeekerWorkspaceMembership();
  const sidebarSections = buildJobSeekerSidebarSections({
    activeItem: activeSidebarItem,
    isVerified,
    hasWorkspace,
    workspaceName,
    onDashboardSection: setDashboardSection,
  });

  const hasCompletedProfileSetup = Boolean((profile?.fullName ?? profile?.full_name)?.trim());
  const userName = (profile?.fullName ?? profile?.full_name) || user?.email?.split('@')[0] || 'Candidate';
  const { name: shellDisplayName, initials: userInitials } = jobSeekerShellUser(profile, user);

  return (
    <div className="min-h-screen">
      {/* Role-title modal hidden for now; restore when candidate role selection returns.
      {false && (
        <JobTitleModal
          open={showJobTitleModal}
          roleType={roleType}
          onSave={(title) => {
            setProfile((p: any) => (p ? { ...p, targetJobTitle: title } : p));
          }}
        />
      )}
      */}
      <DashboardShell
        sidebarSections={sidebarSections}
        user={{
          name: shellDisplayName,
          role: isVerified ? "Elite verified ✦" : "Building verified proof",
          initials: userInitials,
        }}
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
            <div className="dashboard-section-header flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1>My Resume</h1>
                <p>Your ProvenHire Resume — verified signals, scores, and spotlight projects recruiters open when they trust the platform.</p>
              </div>
              <Button asChild className="dashboard-btn-gold shrink-0">
                <Link to="/dashboard/jobseeker/resume">View ProvenHire Resume</Link>
              </Button>
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
                <p>Portable proof of what you can do — Level 1 gets you in the door; higher levels unlock stronger roles and a fuller ProvenHire Resume.</p>
              </div>
            </div>
            {profile && (
              <SkillPassport
                certificationLevel={certificationLevel}
                skills={profile.skills || []}
                verificationStatus={profile.verificationStatus ?? profile.verification_status}
                roleType={roleType}
                nonTechHasDomainFundamentals={nonTechHasDomainFundamentals}
                completedUpToStage={completedUpToStage}
                aptitudeScore={testResults.aptitude ? (() => {
                  const t = testResults.aptitude.total_marks ?? 0;
                  if (typeof testResults.aptitude.percentage === "number") return testResults.aptitude.percentage;
                  const s = testResults.aptitude.total_score ?? 0;
                  return t > 0 ? Math.round((s / t) * 100) : Math.round(s);
                })() : undefined}
                dsaScore={testResults.dsa ? Math.round(testResults.dsa.total_score ?? 0) : undefined}
                interviewScore={(() => {
                  const raw = verificationStages.find((s: { stage_name?: string }) => s.stage_name === "expert_interview")?.score;
                  if (raw == null) return undefined;
                  const n = Number(raw);
                  if (roleType === "non_technical") return Math.round(n);
                  return Math.round((n / 15) * 100);
                })()}
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
                <h1>Verification pipeline</h1>
                <p>
                  {roleType === "non_technical"
                    ? "Progressive proof, not paperwork. Finish each stage to grow your ProvenHire Resume and unlock better-matched roles."
                    : "Evidence over claims. Complete Profile Setup first, earn L1 after DSA, and unlock L2 after the AI Expert Interview."}
                </p>
                {(roleType === "technical" || roleType === "data") && pipelinePendingProfileSetup && (
                  <p className="text-sm text-amber-200/90 border border-amber-400/30 bg-amber-500/10 rounded-lg px-3 py-2 mt-3 max-w-3xl">
                    You’re on the initial verification steps until you finish <strong className="font-semibold">Profile Setup</strong> in the verification flow. After that, your stages update to match the track and experience you entered.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="dashboard-proc-indicator">
                  <span className="dashboard-rec-dot" />
                  Session Proctored
                </span>
                {certificationLevelNumber >= 1 && (
                  <Badge className="bg-emerald-500/15 text-emerald-200 border border-emerald-400/40">
                    <Award className="h-3.5 w-3.5 mr-1.5" />
                    {roleType === "technical" || roleType === "data"
                      ? certificationLevelNumber >= 3
                        ? "Level 3 — Elite verified"
                        : certificationLevelNumber >= 2
                          ? "Level 2 - AI interview cleared"
                          : "Level 1 - DSA verified"
                      : certificationLevelNumber >= 3
                        ? "Level 3 — AI Expert verified"
                        : certificationLevelNumber >= 2
                          ? "Level 2 — Assignment verified"
                          : "Level 1 — Foundation verified"}
                  </Badge>
                )}
                <Button className="dashboard-btn-gold" onClick={() => navigate('/verification')}>
                  Continue {nextStageLabel} →
                </Button>
              </div>
            </div>
            <div className="dashboard-section-content">
              <div className="grid gap-3 mb-6 sm:grid-cols-3">
                {(["L1", "L2", "L3"] as const).map((code, idx) => {
                  const step = idx + 1;
                  const activeByNumber = certificationLevelNumber >= step;
                  const activeByCode = provenhireCertCode === code;
                  const isTechnicalLadder = roleType === "technical" || roleType === "data";
                  const profileStageDone = verificationStages.some(
                    (s: any) => s.stage_name === "profile_setup" && s.status === "completed"
                  );
                  const technicalHighlight =
                    code === "L1"
                      ? profileStageDone
                      : code === "L2"
                        ? certificationLevelNumber >= 1
                        : certificationLevelNumber >= 2;
                  const highlight = isTechnicalLadder
                    ? technicalHighlight
                    : activeByCode || (provenhireCertCode == null && activeByNumber);
                  const displayCode: Record<string, string> = isTechnicalLadder
                    ? { L1: "Step 1", L2: "L1", L3: "L2" }
                    : { L1: "L1", L2: "L2", L3: "L3" };
                  const titles: Record<string, string> =
                    roleType === "data"
                      ? { L1: "Profile Setup", L2: "DSA Completion", L3: "AI Interview Cleared" }
                      : roleType === "technical"
                        ? { L1: "Profile Setup", L2: "DSA Completion", L3: "AI Interview Cleared" }
                      : {
                          L1: "Foundation",
                          L2: "Assignment verified",
                          L3: "AI Expert",
                        };
                  return (
                    <div
                      key={code}
                      className={`rounded-xl border p-4 transition-colors ${
                        highlight
                          ? "border-emerald-400/50 bg-emerald-500/10"
                          : "border-[var(--dash-navy-border)] opacity-80"
                      }`}
                    >
                      <div className="text-xs font-semibold text-emerald-300/90">{displayCode[code]}</div>
                      <div className="text-sm font-medium text-white mt-1">{titles[code]}</div>
                      {highlight && provenhireCertSubtitle ? (
                        <p className="text-xs text-[var(--dash-text-muted)] mt-2 leading-snug">{provenhireCertSubtitle}</p>
                      ) : (
                        <p className="text-xs text-[var(--dash-text-muted)] mt-2 leading-snug">
                          {roleType === "technical" || roleType === "data"
                            ? code === "L1"
                              ? "First step before verification begins"
                              : code === "L2"
                                ? roleType === "data"
                                  ? "Data AI Skills; mid/senior also complete Data System Design — then AI Expert"
                                  : "L1 unlocks after passing the DSA Round"
                                : roleType === "data"
                                  ? "AI Expert interview caps the data verification path"
                                  : "L2 unlocks after clearing the AI Expert Interview"
                            : code === "L1"
                              ? "Profile and (for early-career) domain fundamentals"
                              : code === "L2"
                                ? "Written assessment — hobby magazine blog in a topic you choose"
                                : "AI Expert Interview — capstone on this track"}
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
                          {isVerified && <><span style={{ width: 4, height: 4, background: 'var(--dash-gold)', borderRadius: '50%', display: 'inline-block' }} /><span>Elite verified path</span></>}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="dashboard-stage-time-badge">
                    <div className="dashboard-stage-time-label">Typical time to full verify</div>
                    <div className="dashboard-stage-time-value">2–5 days</div>
                    <div className="dashboard-stage-time-label mt-1">
                      {`${stageOrder.length} stages on this track`}
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
                {(roleType === "technical" || roleType === "data"
                  ? stageOrder.filter((s) => s !== "human_expert_interview")
                  : stageOrder
                ).map((stageName, idx) => {
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
                    profile_setup:
                      'Build your target role and evidence base — resume-aware setup so later stages stay relevant to you.',
                    aptitude_test:
                      'Proctored cognitive assessment: reasoning, quantitative, and verbal items timed on the server.',
                    cs_fundamentals:
                      'Same rigour as our cognitive band — timed, proctored fundamentals before live coding (early-career path).',
                    domain_fundamentals:
                      'Timed aptitude plus domain MCQs tailored to your target non-technical role (early-career path).',
                    data_fundamentals:
                      'Timed aptitude plus data-focused fundamentals (SQL, Python, stats basics) for early-career data paths.',
                    dsa_round: 'Proctored live coding: algorithmic problems matched to your experience tier.',
                    data_round: 'Proctored SQL and Python data tasks executed in a sandbox — core gate for Level 1 on the data track.',
                    non_tech_assignment:
                      'Generic writing gate: pick a hobby topic, then brainstorm, outline, reference, and polish a blog-style article (PDF/DOCX).',
                    ai_skills_interview:
                      'Legacy AI skills stage retained for old records; new developer paths skip this step.',
                    data_skills_interview:
                      'Walkthrough of your Data Round work plus depth checks on SQL, Python, and data skills from your profile.',
                    system_design_interview:
                      'Legacy system design stage retained for old records; new developer paths skip this step.',
                    data_system_design:
                      'Data platform design: LLD (schemas, pipelines, quality) then HLD (scale, orchestration, reliability).',
                    expert_interview:
                      roleType === "non_technical"
                        ? 'AI Expert Interview — structured rubric on communication, judgment, and role craft (voice-first).'
                        : 'Capstone AI technical interview — adversarial follow-ups on depth and reasoning (voice-first).',
                    human_expert_interview:
                      'Live conversation with a vetted domain expert — final trust layer when you pursue Elite verification.',
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
                        {(stageName === 'aptitude_test' ||
                          stageName === 'cs_fundamentals' ||
                          stageName === 'domain_fundamentals' ||
                          stageName === 'data_fundamentals') && (
                          <>
                            <span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Proctored</span>
                            <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Timed attempt</span>
                          </>
                        )}
                        {(stageName === 'dsa_round' || stageName === 'data_round') && (
                          <>
                            <span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Proctored</span>
                            <span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Sandbox Executed</span>
                          </>
                        )}
                        {stageName === 'non_tech_assignment' && (
                          <span className="dashboard-trust-chip">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Topic-led
                          </span>
                        )}
                        {(stageName === 'ai_skills_interview' ||
                          stageName === 'system_design_interview' ||
                          stageName === 'data_skills_interview' ||
                          stageName === 'data_system_design') && (
                          <>
                            <span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Proctored</span>
                            <span className="dashboard-trust-chip"><span style={{ background: 'var(--dash-gold)' }} className="w-1.5 h-1.5 rounded-full" /> AI adaptive</span>
                          </>
                        )}
                        {stageName === 'expert_interview' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Recording Active</span><span className="dashboard-trust-chip"><span style={{ background: 'var(--dash-gold)' }} className="w-1.5 h-1.5 rounded-full" /> AI Adaptive</span></>}
                        {stageName === 'human_expert_interview' && <><span className="dashboard-trust-chip"><span className="dashboard-rec-dot" /> Live Recorded</span><span className="dashboard-trust-chip"><span className="w-1.5 h-1.5 rounded-full bg-[var(--dash-emerald)]" /> Expert Panel</span></>}
                      </div>
                      {isCompleted && stageName === 'profile_setup' && <div className="mt-3 text-sm font-semibold text-[var(--dash-text-muted)]">✓ Completed</div>}
                      {isCompleted && (stageName === 'aptitude_test' || stageName === 'cs_fundamentals') && aptitudeDisplay && (
                        <><div className="dashboard-score-bar"><div className="dashboard-score-fill" style={{ width: `${aptitudePct ?? 0}%` }} /></div><div className="dashboard-score-text">Score: {aptitudeDisplay}</div></>
                      )}
                      {isCompleted && stageName === 'dsa_round' && dsaSolved && (
                        <><div className="dashboard-score-bar"><div className="dashboard-score-fill" style={{ width: `${dsaPct ?? 0}%` }} /></div><div className="dashboard-score-text">{dsaSolved} Problems Solved{dsaPct != null ? ` (${dsaPct}%)` : ''}</div></>
                      )}
                      {isCompleted && stageName === 'non_tech_assignment' && <div className="dashboard-score-text">Score: {stageData?.score ?? 0}/100</div>}
                      {stageName === 'expert_interview' &&
                        stageData?.status === 'pending_review' &&
                        (roleType === "technical" || roleType === "data") && (
                        <div className="mt-3 text-sm font-semibold text-amber-600">Under review — expect an email in 10–15 hours</div>
                      )}
                      {isCompleted && stageName === 'expert_interview' && (
                        <div className="dashboard-score-text">
                          {roleType === "non_technical"
                            ? `Interview score: ${Math.round(Number(stageData?.score) || 0)}%`
                            : `Certified Level ${certificationLevel || '—'}`}
                        </div>
                      )}
                      {isCompleted && stageName === 'domain_fundamentals' && stageData?.score != null && (
                        <div className="dashboard-score-text">Score: {Math.round(Number(stageData.score))}%</div>
                      )}
                      {isCompleted && stageName === 'human_expert_interview' && <div className="mt-3 text-sm font-semibold text-[var(--dash-text-muted)]">✓ Completed</div>}
                      {isActive && (
                        <Button
                          className="dashboard-btn-gold w-full mt-4 py-3"
                          onClick={() =>
                            navigate(
                              stageName === "expert_interview"
                                ? "/dashboard/jobseeker/antigravity"
                                : "/verification"
                            )
                          }
                        >
                          {stageName === "expert_interview"
                            ? "Open Antigravity Lab →"
                            : isFailed
                              ? `Retry ${STAGE_LABELS[stageName]} →`
                              : `Start ${STAGE_LABELS[stageName]} →`}
                        </Button>
                      )}
                    </div>
                  );
                })}

                {/* Human Expert Interview UI hidden for current simplified candidate flow. */}
                {false && roleType === 'technical' && (() => {
                  const showHumanExpertCta =
                    getStageStatus('human_expert_interview') === 'active' ||
                    (humanInterviewGate &&
                      (humanInterviewGate.can_access_payment_page || humanInterviewGate.can_access_slots));
                  const humanPillActive = getStageStatus('human_expert_interview') === 'active' || !!showHumanExpertCta;
                  return (
                <div className={`dashboard-stage-card full-width ${humanPillActive ? 'active-stage' : 'locked-stage'}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`dashboard-stage-num ${humanPillActive ? 'active-num' : 'locked-num'}`}>
                      {String(humanStageStepNumber).padStart(2, '0')}
                    </div>
                    <div className={`flex items-center gap-1.5 dashboard-stage-pill px-3 py-1.5 rounded-[20px] ${humanPillActive ? 'dashboard-pill-active' : 'dashboard-pill-locked'}`}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: humanPillActive ? 'var(--dash-gold)' : 'var(--dash-text-muted)' }} />
                      {humanInterviewGate?.admin_review_status === 'pending'
                        ? 'Waiting for employer'
                        : humanInterviewGate?.admin_review_status === 'recruiter_redirected'
                          ? 'Employer chose other path'
                          : humanInterviewGate?.requires_payment || humanInterviewGate?.payment_status === 'pending'
                            ? 'Payment required'
                            : humanPillActive
                              ? 'In Progress'
                              : 'Locked'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 items-start">
                    <div>
                      <h3 className="dashboard-stage-card-title">Human expert interview</h3>
                      <p className="dashboard-stage-card-desc">
                        Optional Elite step: 30–45 minutes with a vetted domain expert — only when a hiring employer selects the ProvenHire Human Expert path after your AI Expert Interview. Other employers may choose another AI screening or their own team interview instead.
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
                      <div className="text-sm font-semibold uppercase tracking-wide text-[var(--dash-text-muted)] mb-2">Who unlocks this step</div>
                      <div className="text-sm text-[var(--dash-gold)] font-medium leading-snug">
                        The employer for roles you applied to — not ProvenHire by default.
                      </div>
                      <div className="text-sm text-[var(--dash-text-muted)] mt-2 leading-relaxed">
                        They choose: ProvenHire AI follow-up, Human Expert here, or their own employee interview. You will see booking here only when Human Expert is selected.
                      </div>
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
                  technicalPipelineSteps={technicalStepsBeforeHuman.filter(
                    (s) => s !== "profile_setup"
                  )}
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
