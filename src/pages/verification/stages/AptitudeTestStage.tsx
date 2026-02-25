import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Clock, CheckCircle2, XCircle, ArrowRight, ArrowLeft, AlertTriangle, Monitor, Camera, Shield, AlertCircle, Video, Loader2, User, Scan, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { skipSupabaseRequests } from "@/lib/skipSupabase";
import { toast } from "sonner";
import { generateTestQuestions, getQuestionCategory, AptitudeQuestion } from "@/data/aptitudeQuestions";
import { uploadScreenRecording } from "@/utils/recordingUpload";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import AntiCheatOverlay from "@/components/AntiCheatOverlay";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AptitudeTestStageProps {
  onComplete: () => void;
}

interface Answer {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  section: string;
}

const AptitudeTestStage = ({ onComplete }: AptitudeTestStageProps) => {
  const [stage, setStage] = useState<"setup" | "intro" | "test" | "result">("setup");
  const [questions, setQuestions] = useState<AptitudeQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes
  const [difficulty, setDifficulty] = useState<"Easy" | "Hard">("Easy");
  const [experienceYears, setExperienceYears] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState({
    total: 0,
    logical: 0,
    passed: false
  });
  const [showViolationDialog, setShowViolationDialog] = useState(false);
  const [antiCheatReady, setAntiCheatReady] = useState(false);
  
  // Camera setup state
  const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [checkingCamera, setCheckingCamera] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const MAX_TAB_SWITCHES = 3;

  const handleMaxViolations = useCallback(() => {
    setShowViolationDialog(true);
    // Auto-submit test after max violations
    setTimeout(() => {
      handleSubmitTest();
    }, 3000);
  }, []);

  const {
    isFullScreen,
    webcamEnabled,
    tabSwitchCount,
    violations,
    webcamSnapshot,
    startMonitoring,
    stopMonitoring,
    captureSnapshot,
    isTestActive,
    // New features
    isRecording,
    faceVerificationEnabled,
    lastFaceVerification,
    faceViolations,
    getRecordingBlob,
  } = useAntiCheat({
    maxTabSwitches: MAX_TAB_SWITCHES,
    enableWebcam: true,
    enableScreenRecording: true,
    enableFaceVerification: true,
    faceCheckInterval: 20000, // Check every 20 seconds
    onMaxViolations: handleMaxViolations,
    onFaceViolation: (result) => {
      console.log("Face violation detected:", result);
    },
  });

  // Fetch user's experience to determine difficulty
  useEffect(() => {
    const fetchExperience = async () => {
      if (skipSupabaseRequests()) {
        setExperienceYears(0);
        setDifficulty("Easy");
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("job_seeker_profiles")
          .select("experience_years")
          .eq("user_id", user.id)
          .maybeSingle();
        
        const years = data?.experience_years || 0;
        setExperienceYears(years);
        setDifficulty(years >= 3 ? "Hard" : "Easy");
      }
    };
    fetchExperience();
  }, []);

  // Timer
  useEffect(() => {
    if (stage !== "test") return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [stage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTestActive) {
        stopMonitoring();
      }
      // Cleanup camera stream
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isTestActive, stopMonitoring, cameraStream]);

  // Connect video preview to stream
  useEffect(() => {
    if (videoPreviewRef.current && cameraStream) {
      videoPreviewRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Request camera permission
  const requestCameraPermission = async () => {
    setCheckingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false 
      });
      setCameraStream(stream);
      setCameraPermission('granted');
      toast.success("Camera access granted! You can now proceed.");
    } catch (error: any) {
      console.error("Camera access denied:", error);
      setCameraPermission('denied');
      toast.error("Camera access denied. Please allow camera access to continue.");
    } finally {
      setCheckingCamera(false);
    }
  };

  // Proceed to intro after camera setup
  const proceedToIntro = () => {
    // Stop the preview stream (will be re-initialized during test)
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setStage("intro");
  };

  const startTest = async () => {
    const { fullscreenSuccess, webcamSuccess, screenRecordingSuccess, faceVerificationSuccess } = await startMonitoring();
    
    if (!fullscreenSuccess) {
      toast.warning("Fullscreen mode is required. Please allow fullscreen and try again.");
    }
    
    if (screenRecordingSuccess) {
      toast.success("Screen recording started for proctoring");
    }
    
    if (faceVerificationSuccess) {
      toast.info("Face verification enabled - stay in front of the camera");
    }
    
    setAntiCheatReady(true);
    const testQuestions = generateTestQuestions(difficulty);
    setQuestions(testQuestions);
    setStage("test");
    setTimeLeft(30 * 60);

    // Ensure fullscreen after permissions prompts
    setTimeout(() => {
      requestFullscreen().catch(() => {});
    }, 300);

    // Capture snapshot at start
    if (webcamSuccess) {
      setTimeout(() => captureSnapshot(), 2000);
    }
  };

  const requestFullscreen = useCallback(async () => {
    const elem = document.documentElement;
    try {
      if (document.fullscreenElement) return true;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
      return true;
    } catch (error) {
      console.error("Fullscreen request failed:", error);
      return false;
    }
  }, []);

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer);
  };

  const handleNextQuestion = () => {
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = selectedAnswer === currentQuestion.answer;
    
    const newAnswer: Answer = {
      questionId: currentQuestion.id,
      selectedAnswer,
      isCorrect,
      section: currentQuestion.section
    };

    setAnswers((prev) => [...prev.filter(a => a.questionId !== currentQuestion.id), newAnswer]);
    setSelectedAnswer("");

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
      const prevAnswer = answers.find(a => a.questionId === questions[currentQuestionIndex - 1].id);
      setSelectedAnswer(prevAnswer?.selectedAnswer || "");
    }
  };

  const handleSubmitTest = useCallback(async () => {
    setLoading(true);
    stopMonitoring();
    
    // Capture final snapshot
    await captureSnapshot();
    
    // Save current answer if any
    const finalAnswers = [...answers];
    if (selectedAnswer && questions[currentQuestionIndex]) {
      const currentQuestion = questions[currentQuestionIndex];
      const isCorrect = selectedAnswer === currentQuestion.answer;
      const newAnswer: Answer = {
        questionId: currentQuestion.id,
        selectedAnswer,
        isCorrect,
        section: currentQuestion.section
      };
      finalAnswers.push(newAnswer);
    }

    // Calculate scores using the category function
    let logicalScore = 0;

    finalAnswers.forEach(a => {
      if (!a.isCorrect) return;
      const question = questions.find(q => q.id === a.questionId);
      if (!question) return;
      const category = getQuestionCategory(question);
      if (category === "logical") logicalScore++;
    });

    const totalScore = logicalScore;
    // Reduce passing threshold if there were violations
    const passingThreshold = tabSwitchCount >= MAX_TAB_SWITCHES ? 15 : 9; // Fail if max violations
    const passed = totalScore >= 9 && tabSwitchCount < MAX_TAB_SWITCHES;

    setResult({
      total: totalScore,
      logical: logicalScore,
      passed
    });

    try {
      if (skipSupabaseRequests()) {
        setStage("result");
        setLoading(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Generate a test ID for the recording
        const testId = crypto.randomUUID();
        
        // Upload screen recording if available
        let screenRecordingUrl: string | undefined;
        const recordingBlob = getRecordingBlob();
        if (recordingBlob) {
          toast.info("Uploading screen recording...");
          const uploadResult = await uploadScreenRecording(user.id, testId, 'aptitude', recordingBlob);
          if (uploadResult.success) {
            screenRecordingUrl = uploadResult.url;
            toast.success("Screen recording uploaded successfully");
          } else {
            console.error("Recording upload failed:", uploadResult.error);
          }
        }

        // Save results with anti-cheat data
        await supabase.from("aptitude_test_results").insert({
          id: testId,
          user_id: user.id,
          total_score: totalScore,
          verbal_score: verbalScore,
          logical_score: logicalScore,
          data_integrity_score: dataIntegrityScore,
          total_questions: 15,
          time_taken_seconds: 30 * 60 - timeLeft,
          difficulty,
          passed,
          screen_recording_url: screenRecordingUrl,
          answers: {
            responses: finalAnswers,
            antiCheat: {
              tabSwitches: tabSwitchCount,
              violations: violations,
              webcamEnabled,
              fullscreenMaintained: isFullScreen,
              screenRecorded: isRecording,
              faceVerificationEnabled,
              faceViolations,
              lastFaceVerification: lastFaceVerification ? {
                faceDetected: lastFaceVerification.faceDetected,
                multipleFaces: lastFaceVerification.multipleFaces,
                matchesBaseline: lastFaceVerification.matchesBaseline,
                confidence: lastFaceVerification.confidence,
              } : null,
            }
          } as any
        });

        // Update verification stage
        if (passed) {
          await supabase
            .from("verification_stages")
            .update({ status: "completed", score: totalScore, completed_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("stage_name", "aptitude_test");
        } else {
          await supabase
            .from("verification_stages")
            .update({ status: "failed", score: totalScore })
            .eq("user_id", user.id)
            .eq("stage_name", "aptitude_test");
        }
      }
    } catch (error: any) {
      toast.error("Failed to save results: " + error.message);
    }

    setStage("result");
    setLoading(false);
  }, [answers, currentQuestionIndex, difficulty, questions, selectedAnswer, timeLeft, tabSwitchCount, violations, webcamEnabled, isFullScreen, captureSnapshot, stopMonitoring, getRecordingBlob]);

  // Violation Dialog
  const ViolationDialog = () => (
    <AlertDialog open={showViolationDialog} onOpenChange={setShowViolationDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Test Violation Detected
          </AlertDialogTitle>
          <AlertDialogDescription>
            You have exceeded the maximum number of allowed tab switches ({MAX_TAB_SWITCHES}). 
            Your test will be automatically submitted. This may affect your score.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Understood</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Camera Setup Screen
  if (stage === "setup") {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Video className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">Camera Setup Required</CardTitle>
          <CardDescription>
            We need to verify your identity and monitor the test environment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Camera Preview Area */}
          <div className="relative aspect-video bg-muted rounded-xl overflow-hidden border-2 border-dashed border-border">
            {cameraStream ? (
              <video
                ref={videoPreviewRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Camera className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-sm">Camera preview will appear here</p>
              </div>
            )}
            
            {/* Recording indicator */}
            {cameraStream && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium">Camera Active</span>
              </div>
            )}
          </div>

          {/* Permission status */}
          <div className="space-y-4">
            {cameraPermission === 'pending' && (
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Why do we need camera access?</h4>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5 text-primary" />
                    <span>To verify your identity during the test</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Monitor className="h-4 w-4 mt-0.5 text-primary" />
                    <span>To ensure test integrity and prevent cheating</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary" />
                    <span>Snapshots are taken periodically during the test</span>
                  </li>
                </ul>
              </div>
            )}

            {cameraPermission === 'denied' && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <h4 className="font-medium text-destructive">Camera Access Denied</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Please enable camera access in your browser settings and try again. 
                      Camera access is required to take the proctored test.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {cameraPermission === 'granted' && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <h4 className="font-medium text-green-700 dark:text-green-400">Camera Ready!</h4>
                    <p className="text-sm text-muted-foreground">
                      Your camera is working. Make sure your face is clearly visible.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            {cameraPermission === 'pending' && (
              <Button 
                onClick={requestCameraPermission} 
                className="w-full" 
                size="lg"
                disabled={checkingCamera}
              >
                {checkingCamera ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking Camera...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4 mr-2" />
                    Allow Camera Access
                  </>
                )}
              </Button>
            )}

            {cameraPermission === 'denied' && (
              <Button 
                onClick={requestCameraPermission} 
                className="w-full" 
                size="lg"
                variant="outline"
              >
                <Camera className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}

            {cameraPermission === 'granted' && (
              <Button 
                onClick={proceedToIntro} 
                className="w-full bg-gradient-hero hover:opacity-90" 
                size="lg"
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>

          {/* Tips */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Tips for best experience:</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Ensure good lighting on your face</li>
              <li>• Position yourself in front of the camera</li>
              <li>• Use a stable internet connection</li>
              <li>• Close other applications to avoid distractions</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Intro Screen
  if (stage === "intro") {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Camera Verified
            </Badge>
          </div>
          <CardTitle className="text-2xl">Aptitude & CS Fundamentals Test</CardTitle>
          <CardDescription>Test your knowledge across multiple domains</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">Test Overview</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">15 Questions</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">30 Minutes</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">60% to Pass</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={difficulty === "Hard" ? "destructive" : "secondary"}>
                  {difficulty} Mode
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium">Question Categories:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span><strong>Logical & Aptitude:</strong> 15 questions - Reasoning, patterns, quantitative aptitude</span>
              </li>
            </ul>
          </div>

          {/* Anti-cheat requirements */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Proctoring Requirements
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Monitor className="h-4 w-4" />
                <span>Fullscreen mode required</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Camera className="h-4 w-4" />
                <span>Webcam & face verification</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Video className="h-4 w-4" />
                <span>Screen recording enabled</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Face ID verification</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span>Max {MAX_TAB_SWITCHES} tab switches allowed</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>Keyboard shortcuts disabled</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">Important Instructions</p>
                <ul className="mt-2 text-yellow-700 dark:text-yellow-300 space-y-1">
                  <li>• Stay in fullscreen mode throughout the test</li>
                  <li>• Do not switch tabs or windows</li>
                  <li>• Your screen will be recorded for review</li>
                  <li>• Face verification runs periodically - stay visible</li>
                  <li>• Test will auto-submit on time expiry or violations</li>
                  <li>• Difficulty is based on your experience: {experienceYears} year(s)</li>
                </ul>
              </div>
            </div>
          </div>

          <Button onClick={startTest} className="w-full" size="lg">
            <Shield className="h-4 w-4 mr-2" />
            Start Test
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Test Screen
  if (stage === "test") {
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    const existingAnswer = answers.find(a => a.questionId === currentQuestion?.id);

    return (
      <>
        <ViolationDialog />
        <AntiCheatOverlay
          isFullScreen={isFullScreen}
          webcamEnabled={webcamEnabled}
          tabSwitchCount={tabSwitchCount}
          maxTabSwitches={MAX_TAB_SWITCHES}
          isMonitoring={isTestActive}
          isRecording={isRecording}
          faceVerificationEnabled={faceVerificationEnabled}
          lastFaceVerification={lastFaceVerification}
          faceViolations={faceViolations}
        />
        
        <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Fullscreen: {isFullScreen ? "On" : "Off"}</span>
          <span>Proctoring: {isTestActive ? "Active" : "Inactive"}</span>
        </div>
        {!isFullScreen && (
          <div className="max-w-3xl mx-auto mb-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Monitor className="h-4 w-4 text-amber-600" />
                <span className="text-amber-800 dark:text-amber-200">
                  Fullscreen is required to continue the test.
                </span>
              </div>
              <Button size="sm" onClick={requestFullscreen}>
                Enter Fullscreen
              </Button>
            </div>
          </div>
        )}
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="outline" className="mb-2">
                  {currentQuestion?.section}
                </Badge>
                <CardTitle className="text-lg">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </CardTitle>
              </div>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                timeLeft < 300 ? "bg-destructive/10 text-destructive" : "bg-muted"
              }`}>
                <Clock className="h-5 w-5" />
                <span className="font-mono text-lg font-bold">{formatTime(timeLeft)}</span>
              </div>
            </div>
            <Progress value={progress} className="mt-4" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/30 rounded-lg p-6">
              <p className="text-lg font-medium">{currentQuestion?.question}</p>
            </div>

            <RadioGroup 
              value={selectedAnswer || existingAnswer?.selectedAnswer || ""} 
              onValueChange={handleAnswerSelect}
              className="space-y-3"
            >
              {currentQuestion?.options.map((option, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center space-x-3 p-4 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                    (selectedAnswer || existingAnswer?.selectedAnswer) === option 
                      ? "border-primary bg-primary/5" 
                      : "border-border"
                  }`}
                  onClick={() => handleAnswerSelect(option)}
                >
                  <RadioGroupItem value={option} id={`option-${idx}`} />
                  <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer text-base">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex items-center justify-between pt-4">
              <Button 
                variant="outline" 
                onClick={handlePrevQuestion}
                disabled={currentQuestionIndex === 0}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              
              {currentQuestionIndex === questions.length - 1 ? (
                <Button 
                  onClick={handleSubmitTest}
                  disabled={!selectedAnswer && !existingAnswer}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Submit
                  <CheckCircle2 className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={handleNextQuestion}
                  disabled={!selectedAnswer && !existingAnswer}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>

            {/* Question Navigator */}
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-3">Quick Navigation:</p>
              <div className="flex flex-wrap gap-2">
                {questions.map((_, idx) => {
                  const isAnswered = answers.some(a => a.questionId === questions[idx].id);
                  const isCurrent = idx === currentQuestionIndex;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                        isCurrent 
                          ? "bg-primary text-primary-foreground" 
                          : isAnswered 
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" 
                            : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // Result Screen
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
          result.passed ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"
        }`}>
          {result.passed ? (
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          ) : (
            <XCircle className="h-10 w-10 text-red-600" />
          )}
        </div>
        <CardTitle className="text-2xl">
          {result.passed ? "Congratulations! You Passed!" : "Test Not Passed"}
        </CardTitle>
        <CardDescription>
          {result.passed 
            ? "You have successfully completed the aptitude test." 
            : tabSwitchCount >= MAX_TAB_SWITCHES 
              ? "Test terminated due to proctoring violations."
              : "Unfortunately, you didn't meet the passing criteria. You can retake the test later."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted/50 rounded-lg p-6">
          <div className="text-center mb-6">
            <p className="text-4xl font-bold text-primary">{result.total}/15</p>
            <p className="text-muted-foreground">Total Score</p>
          </div>
          
          <div className="grid grid-cols-1 gap-4 text-center">
            <div className="p-4 bg-background rounded-lg">
              <p className="text-2xl font-bold">{result.logical}/15</p>
              <p className="text-xs text-muted-foreground">Logical & Aptitude</p>
            </div>
          </div>
        </div>

        {/* Anti-cheat summary */}
        <div className="bg-muted/30 rounded-lg p-4">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Proctoring Summary
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Tab Switches:</span>
              <span className={`ml-2 font-medium ${tabSwitchCount > 0 ? 'text-destructive' : 'text-green-600'}`}>
                {tabSwitchCount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Webcam:</span>
              <span className={`ml-2 font-medium ${webcamEnabled ? 'text-green-600' : 'text-yellow-600'}`}>
                {webcamEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Screen Recording:</span>
              <span className={`ml-2 font-medium ${isRecording ? 'text-green-600' : 'text-yellow-600'}`}>
                {isRecording ? 'Recorded' : 'Not recorded'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Face Violations:</span>
              <span className={`ml-2 font-medium ${faceViolations > 0 ? 'text-destructive' : 'text-green-600'}`}>
                {faceViolations}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Time Taken: {formatTime(30 * 60 - timeLeft)}</span>
          <span>Difficulty: {difficulty}</span>
        </div>

        <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
          {result.passed
            ? "Next step: proceed to the DSA round when you're ready."
            : "Next step: you can retry after the cooldown period. Review your weak areas and try again."}
        </div>

        {result.passed && (
          <Button onClick={onComplete} className="w-full" size="lg">
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default AptitudeTestStage;
