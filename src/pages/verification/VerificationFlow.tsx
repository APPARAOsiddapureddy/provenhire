import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
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
import { CheckCircle, Clock, Lock, AlertTriangle, RotateCcw, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ProfileSetupStage from "./stages/ProfileSetupStage";
import AptitudeTestStage from "./stages/AptitudeTestStage";
import DSARoundStage from "./stages/DSARoundStage";
import ExpertInterviewStage from "./stages/ExpertInterviewStage";
import HumanExpertInterviewStage from "./stages/HumanExpertInterviewStage";
import NonTechnicalAssignmentStage from "./stages/NonTechnicalAssignmentStage";
import { checkInvalidatedTests, checkCooldownStatus, RETAKE_COOLDOWN_HOURS } from "@/utils/recordingUpload";
import { runShortlisting, getShortlistStatus, type ShortlistResult } from "@/lib/shortlisting";

type StageStatus = 'locked' | 'in_progress' | 'completed' | 'failed';

interface VerificationStage {
  stage_name: string;
  status: StageStatus;
  score?: number;
}

interface CooldownInfo {
  aptitude: { inCooldown: boolean; hoursRemaining?: number; cooldownEndsAt?: Date };
  dsa: { inCooldown: boolean; hoursRemaining?: number; cooldownEndsAt?: Date };
}

const VerificationFlow = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stages, setStages] = useState<VerificationStage[]>([]);
  const [currentStage, setCurrentStage] = useState<string>('profile_setup');
  const [loading, setLoading] = useState(true);
  const [invalidatedTests, setInvalidatedTests] = useState<{ aptitude: boolean; dsa: boolean }>({ aptitude: false, dsa: false });
  const [cooldownInfo, setCooldownInfo] = useState<CooldownInfo>({
    aptitude: { inCooldown: false },
    dsa: { inCooldown: false }
  });
  const [shortlistResult, setShortlistResult] = useState<ShortlistResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<"technical" | "non_technical">("technical");
  const [showAllCompletePopup, setShowAllCompletePopup] = useState(false);
  const [targetJobTitle, setTargetJobTitle] = useState<string>("");
  const [testStageStarted, setTestStageStarted] = useState<Record<string, boolean>>({});

  const technicalStageOrder = ['profile_setup', 'aptitude_test', 'dsa_round', 'expert_interview', 'human_expert_interview'];
  const nonTechnicalStageOrder = ['profile_setup', 'non_tech_assignment', 'human_expert_interview'];
  const stageOrder = roleType === "non_technical" ? nonTechnicalStageOrder : technicalStageOrder;
  const STAGE_NAMES_FOR_INSERT = roleType === "non_technical"
    ? ['profile_setup', 'non_tech_assignment', 'human_expert_interview']
    : ['profile_setup', 'aptitude_test', 'dsa_round', 'expert_interview'];
  const LOAD_TIMEOUT_MS = 30000;

  const STAGE_LABELS: Record<string, string> = {
    profile_setup: 'Profile & Resume',
    aptitude_test: 'Aptitude Test',
    dsa_round: 'DSA Round',
    expert_interview: 'AI Expert Interview',
    human_expert_interview: 'Human Expert Interview (5+ years experienced)',
    non_tech_assignment: 'Assignment',
  };
  const getStageLabel = (stageName: string) => STAGE_LABELS[stageName] ?? stageName.split('_').join(' ');

  const mergeStagesWithOrder = (data: VerificationStage[], order = stageOrder): VerificationStage[] =>
    order.map(
      (name) => data.find((s) => s.stage_name === name) ?? { stage_name: name, status: 'locked' as StageStatus }
    );

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    loadVerificationStages();
    checkForInvalidatedTests();
    checkCooldowns();
  }, [user]);

  const checkCooldowns = async () => {
    if (!user) return;
    const [aptitudeCooldown, dsaCooldown] = await Promise.all([
      checkCooldownStatus(user.id, 'aptitude'),
      checkCooldownStatus(user.id, 'dsa'),
    ]);
    setCooldownInfo({
      aptitude: aptitudeCooldown,
      dsa: dsaCooldown,
    });
  };

  const checkForInvalidatedTests = async () => {
    if (!user) return;
    const result = await checkInvalidatedTests(user.id);
    setInvalidatedTests(result);
  };

  const loadVerificationStages = async () => {
    setLoadError(null);
    try {
      const loadWithTimeout = async () => {
        const res = await api.get<{ stages: VerificationStage[]; roleType?: string }>("/api/verification/stages");
        let data = res.stages;
        const rt = (res.roleType as "technical" | "non_technical") || "technical";
        setRoleType(rt);
        // Migrate non-tech: expert_interview -> human_expert_interview for existing users
        if (rt === "non_technical" && data?.length) {
          data = data.map((s: VerificationStage) =>
            s.stage_name === "expert_interview"
              ? { ...s, stage_name: "human_expert_interview" as const }
              : s
          );
        }
        const order = rt === "non_technical" ? nonTechnicalStageOrder : technicalStageOrder;
        const insertNames = rt === "non_technical" ? nonTechnicalStageOrder : ['profile_setup', 'aptitude_test', 'dsa_round', 'expert_interview'];
        const profileRes = await api.get<{ profile: { targetJobTitle?: string } }>("/api/users/job-seeker-profile").catch(() => ({ profile: null }));
        setTargetJobTitle(profileRes?.profile?.targetJobTitle ?? "");

        if (!data || data.length === 0) {
          await initializeStages(rt);
          return;
        }

        // Ensure new stages added in later releases exist for this user (e.g., PRD v3 Stage 5)
        const existingStageNames = new Set(data.map((s) => s.stage_name));
        const missingStages = order.filter((s) => !existingStageNames.has(s));
        if (missingStages.length > 0) {
          const missingRows = missingStages
            .filter((stage) => insertNames.includes(stage))
            .map((stage) => ({
              user_id: user?.id,
              stage_name: stage,
              status: 'locked' as StageStatus,
            }));
          if (missingRows.length > 0) {
            await api.post("/api/verification/stages/bulk", { stages: missingRows });
          }
          const combined = [
            ...(data as VerificationStage[]),
            ...missingRows.map((r) => ({ stage_name: r.stage_name, status: r.status } as VerificationStage)),
          ];
          const stagesList = mergeStagesWithOrder(combined, order);
          setStages(stagesList);
          const firstInProgress = stagesList.find((s) => s.status === 'in_progress');
          const firstFailed = stagesList.find((s) => s.status === 'failed');
          const firstLocked = stagesList.find((s) => s.status === 'locked');
          if (firstInProgress) setCurrentStage(firstInProgress.stage_name);
          else if (firstFailed) setCurrentStage(firstFailed.stage_name);
          else if (firstLocked) setCurrentStage(firstLocked.stage_name);
          else {
            const lastCompleted = stagesList.filter((s) => s.status === 'completed').pop();
            if (lastCompleted) {
              const nextIndex = order.indexOf(lastCompleted.stage_name) + 1;
              if (nextIndex < order.length) setCurrentStage(order[nextIndex]);
            }
          }
          return;
        }

        let stagesList = mergeStagesWithOrder(data as VerificationStage[], order);
        setStages(stagesList);
        const firstInProgress = stagesList.find((s) => s.status === 'in_progress');
        const firstFailed = stagesList.find((s) => s.status === 'failed');
        const firstLocked = stagesList.find((s) => s.status === 'locked');
        if (firstInProgress) setCurrentStage(firstInProgress.stage_name);
        else if (firstFailed) setCurrentStage(firstFailed.stage_name);
        else if (firstLocked) setCurrentStage(firstLocked.stage_name);
        else {
          const lastCompleted = stagesList.filter((s) => s.status === 'completed').pop();
          if (lastCompleted) {
            const nextIndex = order.indexOf(lastCompleted.stage_name) + 1;
            if (nextIndex < order.length) setCurrentStage(order[nextIndex]);
          }
        }

        const expertDone = data.find((s) => s.stage_name === 'expert_interview' && s.status === 'completed');
        if (expertDone) {
          getShortlistStatus(user!.id).then((sl) => {
            setShortlistResult(sl ?? null);
            if (sl && !sl.shortlisted) {
              setStages((prev) =>
                prev.map((s) =>
                  s.stage_name === 'human_expert_interview' ? { ...s, status: 'locked' as StageStatus } : s
                )
              );
            }
          });
        } else {
          setShortlistResult(null);
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
      const r = rt ?? roleType;
      const names = r === "non_technical" ? nonTechnicalStageOrder : technicalStageOrder.filter((s) => s !== 'human_expert_interview');
      const initialStages = names.map((stage, index) => ({
        stageName: stage,
        status: (index === 0 ? 'in_progress' : 'locked') as StageStatus,
      }));
      await api.post("/api/verification/stages/bulk", { stages: initialStages });
      const asStages: VerificationStage[] = initialStages.map(({ stageName, status }) => ({
        stage_name: stageName,
        status,
      }));
      setStages(mergeStagesWithOrder(asStages));
      setCurrentStage('profile_setup');
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
    if (status === 'completed' || status === 'failed') return true;
    if (stageName === 'aptitude_test' && invalidatedTests.aptitude) return true;
    if (stageName === 'dsa_round' && invalidatedTests.dsa) return true;
    return false;
  };

  const retryStage = async (stageName: string) => {
    try {
      if (!user) return;
      const order = roleType === "non_technical" ? nonTechnicalStageOrder : technicalStageOrder;
      const currentIndex = order.indexOf(stageName);
      if (currentIndex < 0) return;

      await api.post("/api/verification/stages/reset", { stageName });

      toast({
        title: "Retry enabled",
        description: "This step is active again.",
      });

      await loadVerificationStages();
      setCurrentStage(stageName);
    } catch (error: any) {
      toast({ title: "Unable to retry step", description: error.message, variant: "destructive" });
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

      if (stageName === 'expert_interview' && nextStage === 'human_expert_interview') {
        let sl: ShortlistResult;
        try {
          sl = await runShortlisting(user.id);
        } catch (shortlistErr: any) {
          sl = {
            shortlisted: false,
            combined_score_pct: 0,
            stage_2_score_pct: null,
            stage_3_score_pct: null,
            stage_4_score_pct: null,
            threshold_pct: 65,
          };
          toast({
            title: "Shortlist check skipped",
            description: shortlistErr?.message ?? "Could not compute shortlist. You can retry or continue from dashboard.",
            variant: "destructive",
          });
        }
        setShortlistResult(sl);
        if (!sl.shortlisted) {
          setShowAllCompletePopup(true);
          toast({
            title: "Stage 4 (AI Expert Interview) complete",
            description: `Combined score ${sl.combined_score_pct.toFixed(1)}% (threshold ${sl.threshold_pct}%). Not shortlisted for Stage 5.`,
          });
        } else {
          toast({
            title: "Shortlisted for Stage 5",
            description: "You can now schedule your Human Expert Interview.",
          });
        }
      } else if (nextStage) {
        await api.post("/api/verification/stages/update", { stageName: nextStage, status: "in_progress" });
      }

      if (stageName === 'human_expert_interview') {
        await api.post("/api/users/job-seeker-profile", { verificationStatus: "verified" });
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
        return (
          <ProfileSetupStage
            roleType={roleType}
            onComplete={() => loadVerificationStages()}
            onContinueToVerification={() => {
              loadVerificationStages();
              setCurrentStage(roleType === "non_technical" ? "non_tech_assignment" : "aptitude_test");
            }}
          />
        );
      case 'non_tech_assignment':
        return !testStageStarted.non_tech_assignment ? (
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Assignment</h3>
              <p className="text-muted-foreground mb-4">
                Start the non-technical assignment when you're ready, or return to the homepage and come back later.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => navigate("/")}>
                  Go to Homepage
                </Button>
                <Button onClick={() => setTestStageStarted((p) => ({ ...p, non_tech_assignment: true }))}>
                  Start Assignment
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <NonTechnicalAssignmentStage
            targetJobTitle={targetJobTitle}
            onComplete={() => completeAndAdvanceStage('non_tech_assignment')}
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
                  Cooldown Period Active
                </AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  You must wait <strong>{cooldownInfo.aptitude.hoursRemaining} hours</strong> before you can retake this test.
                  The cooldown period ends at approximately {cooldownInfo.aptitude.cooldownEndsAt?.toLocaleString()}.
                  <br /><br />
                  <span className="text-sm">This cooldown helps ensure fair assessment for all candidates.</span>
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
                  Your previous aptitude test was invalidated due to proctoring violations. 
                  Please retake the test following all guidelines carefully.
                </AlertDescription>
              </Alert>
            )}
            {/* Next-step landing: Start Test or Go Home */}
            {!cooldownInfo.aptitude.inCooldown && !testStageStarted.aptitude_test ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: Aptitude Test</h3>
                  <p className="text-muted-foreground mb-4">
                    Your profile is ready. Start the aptitude test when you're ready, or return to the homepage and come back later.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, aptitude_test: true }))}>
                      Start Aptitude Test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : !cooldownInfo.aptitude.inCooldown && (
              <AptitudeTestStage
                stageStatus={getStageStatus('aptitude_test')}
                stageScore={stages.find((s) => s.stage_name === 'aptitude_test')?.score}
                onComplete={() => completeAndAdvanceStage('aptitude_test')}
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
                    Start the DSA coding round when you're ready, or return to the homepage and come back later.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, dsa_round: true }))}>
                      Start DSA Round
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : !cooldownInfo.dsa.inCooldown && (
              <DSARoundStage
                stageStatus={getStageStatus('dsa_round')}
                stageScore={stages.find((s) => s.stage_name === 'dsa_round')?.score}
                onComplete={() => completeAndAdvanceStage('dsa_round')}
              />
            )}
          </div>
        );
      case 'expert_interview':
        return (
          <div className="space-y-6">
            {!testStageStarted.expert_interview ? (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold text-foreground mb-2">Next step: AI Expert Interview</h3>
                  <p className="text-muted-foreground mb-4">
                    Start the AI Expert Interview when you're ready, or return to the homepage and come back later.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => navigate("/")}>
                      Go to Homepage
                    </Button>
                    <Button onClick={() => setTestStageStarted((p) => ({ ...p, expert_interview: true }))}>
                      Start AI Expert Interview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
            <ExpertInterviewStage
              onComplete={() => completeAndAdvanceStage('expert_interview')}
              onReturnToDashboard={handleReturnToDashboard}
            />
            {stages.find(s => s.stage_name === 'expert_interview')?.status === 'completed' && (
              <>
                {shortlistResult && !shortlistResult.shortlisted ? (
                  <Alert className="border-amber-500/50 bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle>Not shortlisted for Stage 5</AlertTitle>
                    <AlertDescription>
                      Combined score: {shortlistResult.combined_score_pct.toFixed(1)}% (threshold {shortlistResult.threshold_pct}%). Stage 5 is only for shortlisted candidates. Retry Stage 4 when attempts allow or explore non-tech jobs.
                    </AlertDescription>
                  </Alert>
                ) : (
              <div className="bg-success-muted border border-success-border rounded-xl p-6 text-center">
                <div className="w-16 h-16 mx-auto bg-success-muted rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
                <h3 className="text-xl font-bold text-success mb-2">AI Interview Verified</h3>
                <p className="text-muted-foreground mb-4">
                  {shortlistResult?.shortlisted ? "You're shortlisted. Schedule your Human Expert Interview (Stage 5)." : "Great job. You can now schedule your Human Expert Interview (Stage 5)."}
                </p>
                <div className="bg-background p-4 rounded-lg border border-success-border">
                  <p className="text-foreground font-medium">
                    Next step: book a live 30–45 minute session with a domain expert.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Choose a slot that works for you. You’ll receive confirmation after booking.
                  </p>
                </div>
              </div>
                )}
              </>
            )}
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

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="container mx-auto max-w-6xl py-8">
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
                <Button onClick={handleReturnToDashboard}>
                  Return to Dashboard
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={calculateProgress()} className="h-3 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

        {renderCurrentStage()}

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
      </div>
    </div>
  );
};

export default VerificationFlow;