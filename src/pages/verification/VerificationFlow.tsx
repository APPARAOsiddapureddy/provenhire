import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, Lock, AlertTriangle, RotateCcw, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ProfileSetupStage from "./stages/ProfileSetupStage";
import AptitudeTestStage from "./stages/AptitudeTestStage";
import DSARoundStage from "./stages/DSARoundStage";
import ExpertInterviewStage from "./stages/ExpertInterviewStage";
import { checkInvalidatedTests, checkCooldownStatus, RETAKE_COOLDOWN_HOURS } from "@/utils/recordingUpload";

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

  const stageOrder = ['profile_setup', 'aptitude_test', 'dsa_round', 'expert_interview'];

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
    try {
      const { data, error } = await supabase
        .from('verification_stages')
        .select('*')
        .eq('user_id', user?.id);

      if (error) throw error;

      if (!data || data.length === 0) {
        await initializeStages();
      } else {
        setStages(data as VerificationStage[]);
        const firstInProgress = data.find(s => s.status === 'in_progress');
        const firstLocked = data.find(s => s.status === 'locked');
        if (firstInProgress) {
          setCurrentStage(firstInProgress.stage_name);
        } else if (firstLocked) {
          setCurrentStage(firstLocked.stage_name);
        } else {
          const lastCompleted = data.filter(s => s.status === 'completed').pop();
          if (lastCompleted) {
            const nextIndex = stageOrder.indexOf(lastCompleted.stage_name) + 1;
            if (nextIndex < stageOrder.length) {
              setCurrentStage(stageOrder[nextIndex]);
            }
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Error loading verification status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const initializeStages = async () => {
    try {
      const initialStages = stageOrder.map((stage, index) => ({
        user_id: user?.id,
        stage_name: stage,
        status: index === 0 ? 'in_progress' : 'locked'
      }));

      const { error } = await supabase
        .from('verification_stages')
        .upsert(initialStages, { onConflict: 'user_id,stage_name' });

      if (error) throw error;
      await loadVerificationStages();
    } catch (error: any) {
      toast({
        title: "Error initializing verification",
        description: error.message,
        variant: "destructive",
      });
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
      const currentIndex = stageOrder.indexOf(stageName);
      if (currentIndex < 0) return;

      await Promise.all(
        stageOrder.map((stage, index) => {
          if (index < currentIndex) return Promise.resolve();
          const status = index === currentIndex ? 'in_progress' : 'locked';
          return supabase
            .from('verification_stages')
            .update({ status, score: null, completed_at: null })
            .eq('user_id', user.id)
            .eq('stage_name', stage);
        })
      );

      await supabase
        .from('job_seeker_profiles')
        .update({ verification_status: 'in_progress' })
        .eq('user_id', user.id);

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

      const { error: completeErr } = await supabase
        .from('verification_stages')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('stage_name', stageName);
      if (completeErr) throw completeErr;

      if (nextStage) {
        const { error: unlockErr } = await supabase
          .from('verification_stages')
          .update({ status: 'in_progress' })
          .eq('user_id', user.id)
          .eq('stage_name', nextStage);
        if (unlockErr) throw unlockErr;
      } else {
        await supabase
          .from('job_seeker_profiles')
          .update({ verification_status: 'verified' })
          .eq('user_id', user.id);
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
            onComplete={() => loadVerificationStages()}
            onContinueToVerification={() => {
              loadVerificationStages();
              setCurrentStage('aptitude_test');
            }}
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
            {!invalidatedTests.aptitude && !cooldownInfo.aptitude.inCooldown && (
              <div className="bg-accent/10 border border-accent/20 rounded-lg p-6 mb-4">
                <h3 className="font-semibold text-accent mb-2">🎉 Profile Setup Complete!</h3>
                <p className="text-muted-foreground">
                  Your resume has been uploaded successfully. You can now attempt the aptitude test 
                  whenever you're ready, or come back later to complete it at your convenience.
                </p>
              </div>
            )}
            {/* Only show test stage if not in cooldown */}
            {!cooldownInfo.aptitude.inCooldown && (
              <AptitudeTestStage onComplete={() => completeAndAdvanceStage('aptitude_test')} />
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
            {/* Only show test stage if not in cooldown */}
            {!cooldownInfo.dsa.inCooldown && (
              <DSARoundStage onComplete={() => completeAndAdvanceStage('dsa_round')} />
            )}
          </div>
        );
      case 'expert_interview':
        return (
          <div className="space-y-6">
            <ExpertInterviewStage
              onComplete={() => loadVerificationStages()}
              onReturnToDashboard={handleReturnToDashboard}
            />
            {stages.find(s => s.stage_name === 'expert_interview')?.status === 'completed' && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center">
                <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-green-700 dark:text-green-300 mb-2">
                  Verification Complete!
                </h3>
                <p className="text-green-600 dark:text-green-400 mb-4">
                  Congratulations! You have successfully completed all verification stages.
                </p>
                <div className="bg-white dark:bg-background p-4 rounded-lg border border-green-200 dark:border-green-700">
                  <p className="text-foreground font-medium">
                    🎉 Within 12-24 hours, our team will review your profile and reach out to you with next steps.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Please ensure your contact details are up to date. You'll receive an email confirmation shortly.
                  </p>
                </div>
              </div>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {stageOrder.map((stage) => (
                <div
                  key={stage}
                  className={`p-4 rounded-lg border ${
                    currentStage === stage ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {getStageIcon(getStageStatus(stage))}
                    <span className="text-sm font-medium capitalize">
                      {stage.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {getStageStatus(stage).replace('_', ' ')}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {renderCurrentStage()}
      </div>
    </div>
  );
};

export default VerificationFlow;