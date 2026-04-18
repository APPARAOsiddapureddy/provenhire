import { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, Clock, Lock, AlertTriangle, RotateCcw, Timer, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PaywallModal } from "@/components/PaywallModal";
const ProfileSetupStage = lazy(() => import("./stages/ProfileSetupStage"));
const AptitudeTestStage = lazy(() => import("./stages/AptitudeTestStage"));
const DSARoundStage = lazy(() => import("./stages/DSARoundStage"));
const ExpertInterviewStage = lazy(() => import("./stages/ExpertInterviewStage"));
const HumanExpertInterviewStage = lazy(() => import("./stages/HumanExpertInterviewStage"));
const NonTechnicalAssignmentStage = lazy(() => import("./stages/NonTechnicalAssignmentStage"));
const DataRoundStage = lazy(() => import("./stages/DataRoundStage"));
const DataSystemDesignStage = lazy(() => import("./stages/DataSystemDesignStage"));
const SystemDesignInterviewStage = lazy(() => import("./stages/SystemDesignInterviewStage"));
import PracticeStageDialog from "@/components/PracticeStageDialog";
import { checkInvalidatedTests, checkCooldownStatus } from "@/utils/recordingUpload";
import { stopInterviewAudioOutput } from "@/lib/interviewTts";
import {
  normalizeTechnicalStageOrderForDisplay,
  technicalStageOrderFallback,
  technicalStagesForTier,
} from "@/utils/verificationStageOrder";

type StageStatus = 'locked' | 'in_progress' | 'completed' | 'failed' | 'pending_review';

interface VerificationStage {
  stage_name: string;
  status: StageStatus | string;
  score?: number;
}

interface CooldownInfo {
  aptitude: { inCooldown: boolean; hoursRemaining?: number; daysRemaining?: number; cooldownEndsAt?: Date };
  dsa: { inCooldown: boolean; hoursRemaining?: number; daysRemaining?: number; cooldownEndsAt?: Date };
}

interface VerificationStagesApiResponse {
  stages: VerificationStage[];
  roleType?: string;
  certification_level?: number;
  certification_label?: string;
  stage_order?: string[];
  verification_pipeline_v2?: boolean;
  pipeline_pending_profile_setup?: boolean;
}

const VerificationFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [stages, setStages] = useState<VerificationStage[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('profile_setup');
  const [loading, setLoading] = useState(true);
  const [invalidatedTests, setInvalidatedTests] = useState<{ aptitude: boolean; dsa: boolean }>({ aptitude: false, dsa: false });
  const [cooldownInfo, setCooldownInfo] = useState<CooldownInfo>({
    aptitude: { inCooldown: false },
    dsa: { inCooldown: false }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<"technical" | "non_technical" | "data">("technical");
  const [showAllCompletePopup, setShowAllCompletePopup] = useState(false);
  const [targetJobTitle, setTargetJobTitle] = useState<string>("");
  const [experienceYears, setExperienceYears] = useState<number>(2);
  const [testStageStarted, setTestStageStarted] = useState<Record<string, boolean>>({});
  const [practiceDialog, setPracticeDialog] = useState<"aptitude" | "dsa" | "interview" | null>(null);
  const [retryingStage, setRetryingStage] = useState<string | null>(null);
  const [certificationLevel, setCertificationLevel] = useState(0);
  const [certificationLabel, setCertificationLabel] = useState("Level 0 - Not Yet Certified");
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallStage, setPaywallStage] = useState("");
  const [paywallCooldown, setPaywallCooldown] = useState<Date | null>(null);
  const [paywallPricing, setPaywallPricing] = useState({ singleInr: 399, bundleInr: 649 });

  // If the user navigates away mid-question, stop any in-flight interview audio immediately.
  useEffect(() => {
    stopInterviewAudioOutput();
  }, [location.pathname]);

  const handlePaywallRequired = useCallback(
    (stage: string, pricing: { singleInr: number; bundleInr: number }, cooldown: Date | null) => {
      setPaywallStage(stage);
      setPaywallPricing(pricing);
      setPaywallCooldown(cooldown);
      setShowPaywall(true);
    },
    []
  );

  const [pipelineOrderFromApi, setPipelineOrderFromApi] = useState<string[]>(() => technicalStagesForTier("fresher"));
  const stageOrder = pipelineOrderFromApi;
  const LOAD_TIMEOUT_MS = 30000;

  const resolveTechnicalOrderForResponse = (
    rt: string,
    res: VerificationStagesApiResponse,
    expYears: number
  ): string[] => {
    if (rt === "non_technical" && Array.isArray(res.stage_order) && res.stage_order.length > 0) {
      return res.stage_order;
    }
    const base = technicalStageOrderFallback({
      stageOrderFromApi: res.stage_order,
      verificationPipelineV2: res.verification_pipeline_v2,
      pipelinePendingProfileSetup: res.pipeline_pending_profile_setup,
      experienceYears: expYears,
      roleType: rt,
    });
    return normalizeTechnicalStageOrderForDisplay(base, rt, res.verification_pipeline_v2 === true);
  };

  const STAGE_LABELS: Record<string, string> = {
    profile_setup: "Profile & Resume",
    aptitude_test: "Cognitive Assessment",
    cs_fundamentals: "CS Fundamentals + Aptitude",
    dsa_round: "DSA Round",
    ai_skills_interview: "AI Skills Interview",
    system_design_interview: "System Design Interview",
    expert_interview: "Expert Interview",
    human_expert_interview: "Expert Interview",
    non_tech_assignment: "Written assessment",
    data_fundamentals: "Data Fundamentals + Aptitude",
    domain_fundamentals: "Domain Fundamentals",
    data_round: "Data Round (SQL + Python)",
    data_skills_interview: "AI Skills Interview (Data)",
    data_system_design: "Data System Design",
  };
  const getStageLabel = (stageName: string) => STAGE_LABELS[stageName] ?? stageName.split('_').join(' ');

  const getNextStageInfo = (currentStageName: string): { name: string; label: string } | null => {
    const idx = stageOrder.indexOf(currentStageName);
    if (idx < 0 || idx + 1 >= stageOrder.length) return null;
    const next = stageOrder[idx + 1]!;
    return { name: next, label: getStageLabel(next) };
  };

  const mergeStagesWithOrder = (data: VerificationStage[], order = stageOrder): VerificationStage[] =>
    order.map(
      (name) => data.find((s) => s.stage_name === name) ?? { stage_name: name, status: 'locked' as StageStatus }
    );

  const checkCooldowns = useCallback(async () => {
    if (!user) return;
    const [aptitudeCooldown, dsaCooldown] = await Promise.all([
      checkCooldownStatus(user.id, "aptitude"),
      checkCooldownStatus(user.id, "dsa"),
    ]);
    setCooldownInfo({
      aptitude: aptitudeCooldown,
      dsa: dsaCooldown,
    });
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    loadVerificationStages();
    checkForInvalidatedTests();
    void checkCooldowns();
  }, [user, checkCooldowns]);

  const checkForInvalidatedTests = async () => {
    if (!user) return;
    const result = await checkInvalidatedTests(user.id);
    setInvalidatedTests(result);
  };

  const loadVerificationStages = async () => {
    setLoadError(null);
    try {
      const loadWithTimeout = async () => {
        const res = await api.get<VerificationStagesApiResponse>("/api/verification/stages");
        let data = res.stages;
        const rt = (res.roleType as "technical" | "non_technical" | "data") || "technical";
        setRoleType(rt);
        setCertificationLevel(res.certification_level ?? 0);
        setCertificationLabel(res.certification_label ?? "Level 0 - Not Yet Certified");
        let orderEff: string[] = resolveTechnicalOrderForResponse(rt, res, experienceYears);
        setPipelineOrderFromApi(orderEff);
        // Fetch job-title context and experience in background so stage pipeline can render immediately.
        void api
          .get<{ profile: { targetJobTitle?: string; experienceYears?: number } }>("/api/users/job-seeker-profile")
          .then((profileRes) => {
            const p = profileRes?.profile;
            setTargetJobTitle(p?.targetJobTitle ?? "");
            const exp = p?.experienceYears;
            setExperienceYears(typeof exp === "number" && exp >= 0 ? exp : 2);
          })
          .catch(() => { setTargetJobTitle(""); setExperienceYears(2); });

        if (!data || data.length === 0) {
          await initializeStages(rt);
          return;
        }

        // Backend GET backfills missing pipeline rows; refetch once if this client still sees gaps (e.g. stale first response).
        const existingStageNames = new Set(data.map((s) => s.stage_name));
        const missingStages = orderEff.filter((s) => !existingStageNames.has(s));
        if (missingStages.length > 0) {
          const resRefresh = await api.get<VerificationStagesApiResponse>("/api/verification/stages");
          data = resRefresh.stages ?? [];
          setCertificationLevel(resRefresh.certification_level ?? 0);
          setCertificationLabel(resRefresh.certification_label ?? "Level 0 - Not Yet Certified");
          if (resRefresh.roleType) {
            setRoleType(resRefresh.roleType as "technical" | "non_technical" | "data");
          }
          const rtEff = (resRefresh.roleType as "technical" | "non_technical" | "data") || rt;
          orderEff = resolveTechnicalOrderForResponse(rtEff, resRefresh, experienceYears);
          setPipelineOrderFromApi(orderEff);
        }

        const stagesList = mergeStagesWithOrder(data as VerificationStage[], orderEff);
        setStages(stagesList);
        const firstInProgress = stagesList.find((s) => s.status === 'in_progress');
        const firstFailed = stagesList.find((s) => s.status === 'failed');
        const firstPendingReview = stagesList.find((s) => s.status === 'pending_review');
        const firstLocked = stagesList.find((s) => s.status === 'locked');
        if (firstInProgress) setCurrentStage(firstInProgress.stage_name);
        else if (firstFailed) setCurrentStage(firstFailed.stage_name);
        else if (firstPendingReview) setCurrentStage(firstPendingReview.stage_name);
        else if (firstLocked) setCurrentStage(firstLocked.stage_name);
        else {
          const lastCompleted = stagesList.filter((s) => s.status === "completed").pop();
          if (lastCompleted) {
            const nextIndex = orderEff.indexOf(lastCompleted.stage_name) + 1;
            if (nextIndex < orderEff.length) setCurrentStage(orderEff[nextIndex]!);
          }
        }

      };

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Loading timed out. Please try again.')), LOAD_TIMEOUT_MS)
      );
      await Promise.race([loadWithTimeout(), timeoutPromise]);
    } catch (error: any) {
      const message = error?.message ?? 'Failed to load verification status';
      setLoadError(message);
      toast({
        title: "Error loading verification status",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const initializeStages = async (rt?: "technical" | "non_technical") => {
    try {
      const res = await api.get<{
        stages: VerificationStage[];
        roleType?: string;
        certification_level?: number;
        certification_label?: string;
        stage_order?: string[];
      }>("/api/verification/stages");
      let data = res.stages ?? [];
      const rtEff = (res.roleType as "technical" | "non_technical" | "data") || rt || roleType;
      setRoleType(rtEff);
      setCertificationLevel(res.certification_level ?? 0);
      setCertificationLabel(res.certification_label ?? "Level 0 - Not Yet Certified");
      const orderEff = resolveTechnicalOrderForResponse(rtEff, res as VerificationStagesApiResponse, experienceYears);
      setPipelineOrderFromApi(orderEff);
      setStages(mergeStagesWithOrder(data, orderEff));
      setCurrentStage("profile_setup");
    } catch (error: any) {
      toast({
        title: "Error initializing verification",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const getStageStatus = (stageName: string): StageStatus => {
    const stage = stages.find(s => s.stage_name === stageName);
    return stage?.status || 'locked';
  };

  const getStageIcon = (status: StageStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'pending_review':
        return <Clock className="h-5 w-5 text-amber-500" />;
      default:
        return <Lock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const calculateProgress = () => {
    const completedCount = stages.filter(s => s.status === 'completed').length;
    return (completedCount / stageOrder.length) * 100;
  };

  const handleReturnToDashboard = () => {
    navigate('/dashboard/jobseeker');
  };

  const canRetryStage = (stageName: string) => {
    const status = getStageStatus(stageName);
    if (status === "completed" || status === "failed") return true;
    if ((stageName === "aptitude_test" || stageName === "cs_fundamentals") && invalidatedTests.aptitude)
      return true;
    if (stageName === "dsa_round" && invalidatedTests.dsa) return true;
    return false;
  };

  const retryStage = async (stageName: string, restartImmediately = false) => {
    try {
      if (!user) return;
      const order = stageOrder;
      const currentIndex = order.indexOf(stageName);
      if (currentIndex < 0) return;

      await api.post("/api/verification/stages/reset", { stageName });

      setTestStageStarted((p) => ({ ...p, [stageName]: false }));
      setRetryingStage(stageName);

      toast({
        title: "Retry enabled",
        description: restartImmediately ? "Starting fresh test..." : "Click Start to retake. Proctoring may reuse your previous permissions.",
      });

      await loadVerificationStages();
      setCurrentStage(stageName);

      if (restartImmediately) {
        setTestStageStarted((p) => ({ ...p, [stageName]: true }));
      }
    } catch (error: any) {
      toast({ title: "Unable to retry step", description: error.message, variant: "destructive" });
    }
  };

  const retryAptitudeAndRestart = async () => {
    try {
      if (!user || cooldownInfo.aptitude.inCooldown) return;
      await api.post("/api/verification/stages/reset", { stageName: "aptitude_test" });
      setTestStageStarted((p) => ({ ...p, aptitude_test: false }));
      setRetryingStage("aptitude_test");
      await loadVerificationStages();
      setCurrentStage("aptitude_test");
      setTestStageStarted((p) => ({ ...p, aptitude_test: true }));
      toast({ title: "Retry enabled", description: "Starting fresh Cognitive Assessment." });
    } catch (error: any) {
      toast({ title: "Unable to retry", description: error.message, variant: "destructive" });
    }
  };

  const retryCsFundamentalsAndRestart = async () => {
    try {
      if (!user || cooldownInfo.aptitude.inCooldown) return;
      await api.post("/api/verification/stages/reset", { stageName: "cs_fundamentals" });
      setTestStageStarted((p) => ({ ...p, cs_fundamentals: false }));
      setRetryingStage("cs_fundamentals");
      await loadVerificationStages();
      setCurrentStage("cs_fundamentals");
      setTestStageStarted((p) => ({ ...p, cs_fundamentals: true }));
      toast({ title: "Retry enabled", description: "Starting fresh CS Fundamentals assessment." });
    } catch (error: any) {
      toast({ title: "Unable to retry", description: error.message, variant: "destructive" });
    }
  };

  const retryDsaAndRestart = async () => {
    try {
      if (!user || cooldownInfo.dsa.inCooldown) return;
      await api.post("/api/verification/stages/reset", { stageName: "dsa_round" });
      setTestStageStarted((p) => ({ ...p, dsa_round: false }));
      setRetryingStage("dsa_round");
      await loadVerificationStages();
      setCurrentStage("dsa_round");
      setTestStageStarted((p) => ({ ...p, dsa_round: true }));
      toast({ title: "Retry enabled", description: "Starting fresh DSA round." });
    } catch (error: any) {
      toast({ title: "Unable to retry", description: error.message, variant: "destructive" });
    }
  };

  const completeAndAdvanceStage = async (stageName: string) => {
    try {
      if (!user) return;
      const currentIndex = stageOrder.indexOf(stageName);
      const nextStage = currentIndex >= 0 && currentIndex + 1 < stageOrder.length
        ? stageOrder[currentIndex + 1]
        : null;

      await api.post("/api/verification/stages/update", { stageName, status: "completed" });

      if (nextStage) {
        await api.post("/api/verification/stages/update", { stageName: nextStage, status: "in_progress" });
      }

      const isLastStage = !nextStage || currentIndex === stageOrder.length - 1;
      if (isLastStage) {
        setShowAllCompletePopup(true);
      }

      toast({
        title: "Stage completed",
        description: nextStage ? "Proceeding to the next stage." : "Verification is complete.",
      });

      await loadVerificationStages();
    } catch (error: any) {
      toast({ title: "Unable to progress", description: error.message, variant: "destructive" });
    }
  };

  const renderCurrentStage = () => {
    switch (currentStage) {
      case 'profile_setup':
        {
          const next = getNextStageInfo("profile_setup");
          return (
            <ProfileSetupStage
              roleType={roleType}
              onComplete={() => loadVerificationStages()}
              onContinueToVerification={() => {
                void loadVerificationStages();
              }}
              nextStageName={next?.name}
              nextStageLabel={next?.label}
            />
          );
        }
      case "domain_fundamentals":
        return (
          <div className="space-y-6">
            {!testStageStarted.domain_fundamentals ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Aptitude + Domain Fundamentals</h3>
                  <p className="text-muted-foreground mb-4">
                    25 MCQs (aptitude plus role-domain knowledge for your subtrack). You have 35 minutes. Score at least
                    60% to pass. Retakes are free with a 24-hour cooldown.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, domain_fundamentals: true }))}>
                      Start assessment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <AptitudeTestStage
                key="domain-fundamentals"
                stageStatus={getStageStatus("domain_fundamentals")}
                stageScore={stages.find((s) => s.stage_name === "domain_fundamentals")?.score}
                pipelineStageName="domain_fundamentals"
                nextStageLabel={getNextStageInfo("domain_fundamentals")?.label}
                onComplete={() => void completeAndAdvanceStage("domain_fundamentals")}
                onSessionExpired={() => setTestStageStarted((p) => ({ ...p, domain_fundamentals: false }))}
                onRetry={() => retryStage("domain_fundamentals", true)}
                isRetry={retryingStage === "domain_fundamentals"}
              />
            )}
          </div>
        );
      case 'non_tech_assignment':
        return !testStageStarted.non_tech_assignment ? (
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Written assessment</h3>
              <p className="text-muted-foreground mb-4">
                You will choose a hobby-style topic, then write a magazine blog with brainstorm, outline, and references.
                Start when you have a focused block of time, or return later from the dashboard.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => navigate("/")}>
                  Go to Homepage
                </Button>
                <Button onClick={() => setTestStageStarted((p) => ({ ...p, non_tech_assignment: true }))}>
                  Start written assessment
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <NonTechnicalAssignmentStage
            targetJobTitle={targetJobTitle}
            stageStatus={getStageStatus('non_tech_assignment')}
            stageScore={stages.find(s => s.stage_name === 'non_tech_assignment')?.score}
            isRetry={retryingStage === 'non_tech_assignment'}
            onComplete={async () => {
              await loadVerificationStages();
              setCurrentStage("expert_interview");
            }}
            onPaywallRequired={handlePaywallRequired}
            onRetry={() => retryStage('non_tech_assignment', true)}
          />
        );
      case 'aptitude_test':
        return (
          <div className="space-y-6">
            {/* Cooldown Alert */}
            {cooldownInfo.aptitude.inCooldown && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <Timer className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  Retake unavailable
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300 space-y-3">
                  <p>
                    {cooldownInfo.aptitude.daysRemaining != null && cooldownInfo.aptitude.daysRemaining >= 1 ? (
                      <>
                        After three unsuccessful Cognitive Assessment attempts, the next attempt is available in{" "}
                        <strong>
                          {cooldownInfo.aptitude.daysRemaining} day
                          {cooldownInfo.aptitude.daysRemaining === 1 ? "" : "s"}
                        </strong>
                        .
                      </>
                    ) : (
                      <>
                        You must wait <strong>{cooldownInfo.aptitude.hoursRemaining ?? 0} hours</strong> before you can
                        retake this test.
                      </>
                    )}{" "}
                    {cooldownInfo.aptitude.cooldownEndsAt ? (
                      <>Eligible again after approximately {cooldownInfo.aptitude.cooldownEndsAt.toLocaleString()}.</>
                    ) : null}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/jobseeker")}>
                    Return to dashboard
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {/* Invalidation Alert */}
            {invalidatedTests.aptitude && !cooldownInfo.aptitude.inCooldown && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Test Invalidated - Retake Required
                </AlertTitle>
                <AlertDescription>
                  Your previous Cognitive Assessment was invalidated due to proctoring violations. 
                  Please retake the test following all guidelines carefully.
                </AlertDescription>
              </Alert>
            )}
            {/* Next-step landing: Start Test or Go Home (hidden while aptitude lockout active) */}
            {!cooldownInfo.aptitude.inCooldown && !testStageStarted.aptitude_test ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Cognitive Assessment</h3>
                  <p className="text-muted-foreground mb-4">
                    Your profile is ready. Start the Cognitive Assessment when you&apos;re ready, or return to the homepage and come back later.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPracticeDialog("aptitude")}
                    >
                      <GraduationCap className="h-4 w-4 mr-2" />
                      Practice
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, aptitude_test: true }))}>
                      Start Cognitive Assessment
                    </Button>
                  </div>
                  <PracticeStageDialog
                    open={practiceDialog === "aptitude"}
                    onOpenChange={(o) => !o && setPracticeDialog(null)}
                    type="aptitude"
                    testName="Cognitive Assessment"
                  />
                </CardContent>
              </Card>
            ) : !cooldownInfo.aptitude.inCooldown ? (
              <AptitudeTestStage
                key={retryingStage === 'aptitude_test' ? 'aptitude-retry' : 'aptitude-first'}
                stageStatus={getStageStatus('aptitude_test')}
                stageScore={stages.find((s) => s.stage_name === 'aptitude_test')?.score}
                onComplete={() => {
                  setRetryingStage(null);
                  completeAndAdvanceStage('aptitude_test');
                }}
                onSessionExpired={() => setTestStageStarted((p) => ({ ...p, aptitude_test: false }))}
                onRetry={retryAptitudeAndRestart}
                isRetry={retryingStage === 'aptitude_test'}
                nextStageLabel={getNextStageInfo("aptitude_test")?.label}
                onAfterAptitudeSubmit={() => {
                  void checkCooldowns();
                }}
              />
            ) : null}
          </div>
        );
      case "cs_fundamentals":
        return (
          <div className="space-y-6">
            {cooldownInfo.aptitude.inCooldown && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <Timer className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  Retake unavailable
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300 space-y-3">
                  <p>
                    Cooldown active for assessment retakes. See the timer above or return to the dashboard.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/jobseeker")}>
                    Return to dashboard
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {invalidatedTests.aptitude && !cooldownInfo.aptitude.inCooldown && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Test invalidation
                </AlertTitle>
                <AlertDescription>
                  Your previous attempt was invalidated due to proctoring violations. Retake following all guidelines.
                </AlertDescription>
              </Alert>
            )}
            {!cooldownInfo.aptitude.inCooldown && !testStageStarted.cs_fundamentals ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: CS Fundamentals + Aptitude</h3>
                  <p className="text-muted-foreground mb-4">
                    MCQs covering reasoning, verbal, and CS basics (early-career track). Start when ready.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button variant="secondary" onClick={() => setPracticeDialog("aptitude")}>
                      <GraduationCap className="h-4 w-4 mr-2" />
                      Practice
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, cs_fundamentals: true }))}>
                      Start CS Fundamentals
                    </Button>
                  </div>
                  <PracticeStageDialog
                    open={practiceDialog === "aptitude"}
                    onOpenChange={(o) => !o && setPracticeDialog(null)}
                    type="aptitude"
                    testName="CS Fundamentals + Aptitude"
                  />
                </CardContent>
              </Card>
            ) : !cooldownInfo.aptitude.inCooldown ? (
              <AptitudeTestStage
                key={retryingStage === "cs_fundamentals" ? "cs-retry" : "cs-first"}
                stageStatus={getStageStatus("cs_fundamentals")}
                stageScore={stages.find((s) => s.stage_name === "cs_fundamentals")?.score}
                pipelineStageName="cs_fundamentals"
                onComplete={() => {
                  setRetryingStage(null);
                  void completeAndAdvanceStage("cs_fundamentals");
                }}
                onSessionExpired={() => setTestStageStarted((p) => ({ ...p, cs_fundamentals: false }))}
                onRetry={retryCsFundamentalsAndRestart}
                isRetry={retryingStage === "cs_fundamentals"}
                nextStageLabel={getNextStageInfo("cs_fundamentals")?.label}
                onAfterAptitudeSubmit={() => {
                  void checkCooldowns();
                }}
              />
            ) : null}
          </div>
        );
      case "ai_skills_interview":
        return (
          <div className="space-y-6">
            {!testStageStarted.ai_skills_interview ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: AI Skills Interview</h3>
                  <p className="text-muted-foreground mb-4">
                    DSA walkthrough of your submissions, then AI-led depth checks on skills from your resume. Allow
                    about 30 minutes in one sitting.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await api.post("/api/verification/stages/update", {
                            stageName: "ai_skills_interview",
                            status: "in_progress",
                          });
                          setTestStageStarted((p) => ({ ...p, ai_skills_interview: true }));
                        } catch (err: unknown) {
                          const apiErr = err as { response?: { data?: { code?: string; pricing?: { singleInr: number; bundleInr: number }; nextAvailableAt?: string } } };
                          const code = apiErr?.response?.data?.code;
                          if (code === "PAYMENT_REQUIRED" || code === "COOLDOWN") {
                            handlePaywallRequired(
                              "ai_skills_interview",
                              apiErr?.response?.data?.pricing ?? { singleInr: 399, bundleInr: 649 },
                              code === "COOLDOWN" && apiErr.response?.data?.nextAvailableAt
                                ? new Date(apiErr.response.data.nextAvailableAt)
                                : null
                            );
                          } else {
                            toast({ title: "Cannot start", description: (err as Error)?.message ?? "Try again later.", variant: "destructive" });
                          }
                        }
                      }}
                    >
                      Start AI Skills Interview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ExpertInterviewStage
                targetJobTitle={targetJobTitle || undefined}
                experienceYears={experienceYears}
                verificationRoleType="technical"
                onInterviewAwaitingReview={() => void loadVerificationStages()}
                onReturnToDashboard={handleReturnToDashboard}
                onPaywallRequired={handlePaywallRequired}
              />
            )}
          </div>
        );
      case "system_design_interview":
        return (
          <div className="space-y-6">
            {!testStageStarted.system_design_interview ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: System Design Interview</h3>
                  <p className="text-muted-foreground mb-4">
                    Two-part session: low-level design (classes, APIs, data model), then full system architecture. Allow
                    about 30 minutes. You can type your answers and use Play question for audio.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await api.post("/api/verification/stages/update", {
                            stageName: "system_design_interview",
                            status: "in_progress",
                          });
                          setTestStageStarted((p) => ({ ...p, system_design_interview: true }));
                        } catch (err: unknown) {
                          const apiErr = err as { response?: { data?: { code?: string; pricing?: { singleInr: number; bundleInr: number }; nextAvailableAt?: string } } };
                          const code = apiErr?.response?.data?.code;
                          if (code === "PAYMENT_REQUIRED" || code === "COOLDOWN") {
                            handlePaywallRequired(
                              "system_design_interview",
                              apiErr?.response?.data?.pricing ?? { singleInr: 399, bundleInr: 649 },
                              code === "COOLDOWN" && apiErr.response?.data?.nextAvailableAt
                                ? new Date(apiErr.response.data.nextAvailableAt)
                                : null
                            );
                          } else {
                            toast({ title: "Cannot start", description: (err as Error)?.message ?? "Try again later.", variant: "destructive" });
                          }
                        }
                      }}
                    >
                      Start System Design Interview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <SystemDesignInterviewStage
                targetJobTitle={targetJobTitle || undefined}
                onSessionComplete={() => void loadVerificationStages()}
                onReturnToDashboard={handleReturnToDashboard}
                nextStageLabel={getNextStageInfo("system_design_interview")?.label}
              />
            )}
          </div>
        );
      case 'dsa_round':
        return (
          <div className="space-y-6">
            {/* Cooldown Alert */}
            {cooldownInfo.dsa.inCooldown && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <Timer className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  Cooldown Period Active
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  You must wait <strong>{cooldownInfo.dsa.hoursRemaining} hours</strong> before you can retake this test.
                  The cooldown period ends at approximately {cooldownInfo.dsa.cooldownEndsAt?.toLocaleString()}.
                  <br /><br />
                  <span className="text-sm">This cooldown helps ensure fair assessment for all candidates.</span>
                </AlertDescription>
              </Alert>
            )}
            {/* Invalidation Alert */}
            {invalidatedTests.dsa && !cooldownInfo.dsa.inCooldown && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Test Invalidated - Retake Required
                </AlertTitle>
                <AlertDescription>
                  Your previous DSA round was invalidated due to proctoring violations. 
                  Please retake the test following all guidelines carefully.
                </AlertDescription>
              </Alert>
            )}
            {/* Next-step landing: Start Test or Go Home */}
            {!cooldownInfo.dsa.inCooldown && !testStageStarted.dsa_round ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: DSA Round</h3>
                  <p className="text-muted-foreground mb-4">
                    Solve coding problems under timed, proctored conditions. You need at least 60/100 to pass. Allow about 60 minutes in one sitting.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPracticeDialog("dsa")}
                    >
                      <GraduationCap className="h-4 w-4 mr-2" />
                      Practice
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await api.post("/api/verification/stages/update", {
                            stageName: "dsa_round",
                            status: "in_progress",
                          });
                        } catch {
                          // Non-blocking: backend reconciliation also attempts to auto-activate when eligible.
                        }
                        setTestStageStarted((p) => ({ ...p, dsa_round: true }));
                      }}
                    >
                      Start DSA Round
                    </Button>
                  </div>
                  <PracticeStageDialog
                    open={practiceDialog === "dsa"}
                    onOpenChange={(o) => !o && setPracticeDialog(null)}
                    type="dsa"
                    testName="DSA Round"
                  />
                </CardContent>
              </Card>
            ) : !cooldownInfo.dsa.inCooldown && (
              <DSARoundStage
                stageStatus={getStageStatus('dsa_round')}
                stageScore={stages.find((s) => s.stage_name === 'dsa_round')?.score}
                onComplete={() => completeAndAdvanceStage('dsa_round')}
                onRetry={!cooldownInfo.dsa.inCooldown ? retryDsaAndRestart : undefined}
                isRetry={retryingStage === 'dsa_round'}
                targetJobTitle={targetJobTitle || undefined}
                experienceYears={experienceYears}
                nextStageLabel={getNextStageInfo("dsa_round")?.label}
              />
            )}
          </div>
        );
      case 'expert_interview':
        return (
          <div className="space-y-6">
            {getStageStatus("expert_interview") === "pending_review" && roleType !== "non_technical" ? (
              <Card className="border-2 border-amber-500/30 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-600" />
                    Under review
                  </CardTitle>
                  <CardDescription>
                    Your AI interview is being reviewed. You will receive an email within 10–15 hours. You can return to
                    your dashboard to track status.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleReturnToDashboard}>Back to dashboard</Button>
                </CardContent>
              </Card>
            ) : !testStageStarted.expert_interview ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Expert Interview</h3>
                  <p className="text-muted-foreground mb-4">
                    A 20–30 minute AI-led deep-dive into your experience, projects, and domain expertise. This is the final stage — clear it to unlock your highest certification level.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPracticeDialog("interview")}
                    >
                      <GraduationCap className="h-4 w-4 mr-2" />
                      Practice
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, expert_interview: true }))}>
                      Start Expert Interview
                    </Button>
                  </div>
                  <PracticeStageDialog
                    open={practiceDialog === "interview"}
                    onOpenChange={(o) => !o && setPracticeDialog(null)}
                    type="interview"
                    testName="Expert Interview"
                  />
                </CardContent>
              </Card>
            ) : (
              <>
            <ExpertInterviewStage
              targetJobTitle={targetJobTitle}
              experienceYears={experienceYears}
              verificationRoleType={roleType}
              onInterviewAwaitingReview={async () => {
                await loadVerificationStages();
                handleReturnToDashboard();
              }}
              onReturnToDashboard={handleReturnToDashboard}
              onPaywallRequired={handlePaywallRequired}
            />
              </>
            )}
          </div>
        );
      case 'human_expert_interview':
        return (
          <HumanExpertInterviewStage
            onComplete={() => completeAndAdvanceStage('human_expert_interview')}
            onReturnToDashboard={handleReturnToDashboard}
          />
        );
      // ---------------------------------------------------------------
      // Data track stages — reuse existing components where possible
      // ---------------------------------------------------------------
      case "data_fundamentals":
        return (
          <div className="space-y-6">
            {!testStageStarted.data_fundamentals ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Data Fundamentals + Aptitude</h3>
                  <p className="text-muted-foreground mb-4">
                    20 MCQs covering aptitude, SQL basics, Python fundamentals, statistics, and core data concepts. You have 30 minutes. Score at least 60% to pass.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, data_fundamentals: true }))}>
                      Start Data Fundamentals
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <AptitudeTestStage
                key="data-fundamentals"
                stageStatus={getStageStatus("data_fundamentals")}
                stageScore={stages.find((s) => s.stage_name === "data_fundamentals")?.score}
                pipelineStageName="data_fundamentals"
                nextStageLabel={getNextStageInfo("data_fundamentals")?.label}
                onComplete={() => {
                  void completeAndAdvanceStage("data_fundamentals");
                }}
                onSessionExpired={() => setTestStageStarted((p) => ({ ...p, data_fundamentals: false }))}
                onRetry={() => retryStage("data_fundamentals", true)}
                isRetry={retryingStage === "data_fundamentals"}
                onAfterAptitudeSubmit={() => void checkCooldowns()}
              />
            )}
          </div>
        );
      case "data_round":
        return (
          <div className="space-y-6">
            {!testStageStarted.data_round ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Data Round (SQL + Python)</h3>
                  <p className="text-muted-foreground mb-4">
                    Solve SQL queries and Python data processing tasks under timed conditions. Your solutions will be auto-evaluated against test cases.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await api.post("/api/verification/stages/update", {
                            stageName: "data_round",
                            status: "in_progress",
                          });
                        } catch { /* non-blocking */ }
                        setTestStageStarted((p) => ({ ...p, data_round: true }));
                      }}
                    >
                      Start Data Round
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <DataRoundStage
                stageStatus={getStageStatus("data_round")}
                stageScore={stages.find((s) => s.stage_name === "data_round")?.score}
                onComplete={() => completeAndAdvanceStage("data_round")}
                onRetry={() => retryStage("data_round", true)}
                isRetry={retryingStage === "data_round"}
                nextStageLabel={getNextStageInfo("data_round")?.label}
              />
            )}
          </div>
        );
      case "data_skills_interview":
        return (
          <div className="space-y-6">
            {!testStageStarted.data_skills_interview ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: AI Skills Interview (Data)</h3>
                  <p className="text-muted-foreground mb-4">
                    Walkthrough of your Data Round submissions followed by AI-led depth checks on your data skills. Allow about 30 minutes.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await api.post("/api/verification/stages/update", {
                            stageName: "data_skills_interview",
                            status: "in_progress",
                          });
                          setTestStageStarted((p) => ({ ...p, data_skills_interview: true }));
                        } catch (err: unknown) {
                          const apiErr = err as { response?: { data?: { code?: string; pricing?: { singleInr: number; bundleInr: number }; nextAvailableAt?: string } } };
                          const code = apiErr?.response?.data?.code;
                          if (code === "PAYMENT_REQUIRED" || code === "COOLDOWN") {
                            handlePaywallRequired(
                              "data_skills_interview",
                              apiErr?.response?.data?.pricing ?? { singleInr: 399, bundleInr: 649 },
                              code === "COOLDOWN" && apiErr.response?.data?.nextAvailableAt
                                ? new Date(apiErr.response.data.nextAvailableAt)
                                : null
                            );
                          } else {
                            toast({ title: "Cannot start", description: (err as Error)?.message ?? "Try again later.", variant: "destructive" });
                          }
                        }
                      }}
                    >
                      Start AI Skills Interview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ExpertInterviewStage
                targetJobTitle={targetJobTitle || undefined}
                experienceYears={experienceYears}
                verificationRoleType="data"
                onInterviewAwaitingReview={() => void loadVerificationStages()}
                onReturnToDashboard={handleReturnToDashboard}
                onPaywallRequired={handlePaywallRequired}
              />
            )}
          </div>
        );
      case "data_system_design":
        return (
          <div className="space-y-6">
            {!testStageStarted.data_system_design ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Data System Design</h3>
                  <p className="text-muted-foreground mb-4">
                    Two-part spoken-style session: low-level data design, then platform-wide architecture. Allow about 30 minutes. You can type your answers and use Play question for audio.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await api.post("/api/verification/stages/update", {
                            stageName: "data_system_design",
                            status: "in_progress",
                          });
                          setTestStageStarted((p) => ({ ...p, data_system_design: true }));
                        } catch (err: unknown) {
                          const apiErr = err as { response?: { data?: { code?: string; pricing?: { singleInr: number; bundleInr: number }; nextAvailableAt?: string } } };
                          const code = apiErr?.response?.data?.code;
                          if (code === "PAYMENT_REQUIRED" || code === "COOLDOWN") {
                            handlePaywallRequired(
                              "data_system_design",
                              apiErr?.response?.data?.pricing ?? { singleInr: 399, bundleInr: 649 },
                              code === "COOLDOWN" && apiErr.response?.data?.nextAvailableAt
                                ? new Date(apiErr.response.data.nextAvailableAt)
                                : null
                            );
                          } else {
                            toast({ title: "Cannot start", description: (err as Error)?.message ?? "Try again later.", variant: "destructive" });
                          }
                        }
                      }}
                    >
                      Start Data System Design
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <DataSystemDesignStage
                targetJobTitle={targetJobTitle || undefined}
                onSessionComplete={() => void loadVerificationStages()}
                onReturnToDashboard={handleReturnToDashboard}
                nextStageLabel={getNextStageInfo("data_system_design")?.label}
              />
            )}
          </div>
        );
      case 'verification_complete':
      default:
        return null;
    }
  };
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-subtle p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Could not load verification
            </CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setLoadError(null); setLoading(true); loadVerificationStages(); }}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isInActiveTest =
    (currentStage === "aptitude_test" && testStageStarted.aptitude_test) ||
    (currentStage === "cs_fundamentals" && testStageStarted.cs_fundamentals) ||
    (currentStage === "domain_fundamentals" && testStageStarted.domain_fundamentals) ||
    (currentStage === "data_fundamentals" && testStageStarted.data_fundamentals) ||
    (currentStage === "dsa_round" && testStageStarted.dsa_round) ||
    (currentStage === "data_round" && testStageStarted.data_round) ||
    (currentStage === "expert_interview" && testStageStarted.expert_interview) ||
    (currentStage === "ai_skills_interview" && testStageStarted.ai_skills_interview) ||
    (currentStage === "data_skills_interview" && testStageStarted.data_skills_interview) ||
    (currentStage === "data_system_design" && testStageStarted.data_system_design) ||
    (currentStage === "system_design_interview" && testStageStarted.system_design_interview);

  return (
    <div className={`min-h-screen bg-gradient-subtle ${isInActiveTest ? "p-0 sm:p-2" : "p-4"}`}>
      <div className={`mx-auto ${isInActiveTest ? "w-full max-w-none px-3 sm:px-6 py-2 sm:py-3" : "container max-w-6xl py-8"}`}>
        {!isInActiveTest && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Verification Process</CardTitle>
                  <CardDescription>Complete each stage to become a verified job seeker</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {canRetryStage(currentStage) && (
                    <Button variant="outline" onClick={() => retryStage(currentStage)}>
                      Retry This Step
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="text-muted-foreground border-muted-foreground/30 hover:bg-muted/50" onClick={handleReturnToDashboard}>
                    Return to Dashboard
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">Current certification: L{certificationLevel} - {certificationLabel}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete the remaining stages to unlock higher-level opportunities.
                </p>
                {(roleType === "technical" || roleType === "data") && certificationLevel === 1 && (
                  <p className="text-xs font-medium text-primary mt-2">
                    You have earned Level 1 (Cognitive Verified). Continue with the next stages in order for Level 2 (Skill
                    Passport) and Level 3 (Elite Verified).
                  </p>
                )}
              </div>
              <Progress value={calculateProgress()} className="h-3 mb-6" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {stageOrder.map((stage) => (
                  <div
                    key={stage}
                    className={`p-4 rounded-lg border ${
                      currentStage === stage ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {getStageIcon(getStageStatus(stage))}
                      <span className="text-sm font-medium">
                        {getStageLabel(stage)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">
                      {getStageStatus(stage).split('_').join(' ')}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Suspense
          fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          }
        >
          {renderCurrentStage()}
        </Suspense>

        {/* All steps complete popup */}
        <Dialog open={showAllCompletePopup} onOpenChange={setShowAllCompletePopup}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                Verification Complete
              </DialogTitle>
              <DialogDescription>
                You have successfully completed all verification steps. Your Skill Passport and verification status will be processed within 10–15 hours. You will be notified when ready.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAllCompletePopup(false)}>
                Stay
              </Button>
              <Button onClick={() => { setShowAllCompletePopup(false); navigate("/"); }}>
                Go to Homepage
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <PaywallModal
          open={showPaywall}
          onClose={() => setShowPaywall(false)}
          stage={paywallStage}
          cooldownUntil={paywallCooldown}
          singlePrice={paywallPricing.singleInr}
          bundlePrice={paywallPricing.bundleInr}
        />
      </div>
    </div>
  );
};

export default VerificationFlow;