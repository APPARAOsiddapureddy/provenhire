import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, CheckCircle2, XCircle, ArrowRight, Code, Lightbulb, Play, AlertTriangle, Camera, Monitor, Shield, Video, AlertCircle, Loader2, Terminal, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateDSATest, DSAQuestion, ProgrammingLanguage, supportedLanguages, getLanguageIcon } from "@/data/dsaQuestions";
import { uploadScreenRecording } from "@/utils/recordingUpload";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import AntiCheatOverlay from "@/components/AntiCheatOverlay";
import CodeEditor from "@/components/CodeEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DSARoundStageProps {
  onComplete: () => void;
}

interface Solution {
  questionId: string;
  code: string;
  language: ProgrammingLanguage;
  isCorrect: boolean;
  testsPassed: number;
  totalTests: number;
}

const DSARoundStage = ({ onComplete }: DSARoundStageProps) => {
  const [stage, setStage] = useState<"setup" | "intro" | "test" | "result">("setup");
  const [questions, setQuestions] = useState<DSAQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [code, setCode] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<ProgrammingLanguage>("python");
  const [timeLeft, setTimeLeft] = useState(60 * 60); // 60 minutes
  const [experienceYears, setExperienceYears] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [testOutput, setTestOutput] = useState<string>("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState({
    totalScore: 0,
    problemsSolved: 0,
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
      handleSubmitAll();
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
    isRecording,
    faceVerificationEnabled,
    lastFaceVerification,
    faceViolations,
    audioMonitoringEnabled,
    lastAudioDetection,
    audioViolations,
    getRecordingBlob,
  } = useAntiCheat({
    maxTabSwitches: MAX_TAB_SWITCHES,
    enableWebcam: true,
    enableScreenRecording: true,
    enableFaceVerification: true,
    enableAudioMonitoring: true,
    faceCheckInterval: 20000,
    onMaxViolations: handleMaxViolations,
    onFaceViolation: (result) => {
      console.log("Face violation detected:", result);
    },
    onAudioViolation: (result) => {
      console.log("Audio violation detected:", result);
    },
  });

  // Fetch user's experience
  useEffect(() => {
    const fetchExperience = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("job_seeker_profiles")
          .select("experience_years")
          .eq("user_id", user.id)
          .maybeSingle();
        
        setExperienceYears(data?.experience_years || 0);
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
          handleSubmitAll();
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
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
    const testQuestions = generateDSATest(experienceYears);
    setQuestions(testQuestions);
    // Load initial template for first question
    if (testQuestions[0]?.templates?.[selectedLanguage]) {
      setCode(testQuestions[0].templates[selectedLanguage]);
    }
    setStage("test");
    setTimeLeft(60 * 60);

    // Ensure fullscreen after permissions prompts
    setTimeout(() => {
      requestFullscreen().catch(() => {});
    }, 300);

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

  const runTests = async () => {
    const currentQuestion = questions[currentQuestionIndex];
    setIsExecuting(true);
    setTestOutput("⏳ Executing code...\n");
    
    try {
      const { data, error } = await supabase.functions.invoke("execute-code", {
        body: {
          code,
          language: selectedLanguage,
          testCases: currentQuestion.testCases,
          functionName: currentQuestion.functionName,
        },
      });

      if (error) {
        console.error("Execution error:", error);
        setTestOutput(`❌ Execution Error: ${error.message}\n\nPlease check your code and try again.`);
        toast.error("Code execution failed");
        setIsExecuting(false);
        return;
      }

      // Format output
      let output = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
      output += `📊 EXECUTION RESULTS\n`;
      output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

      data.results.forEach((result: any) => {
        const icon = result.passed ? "✅" : "❌";
        output += `${icon} Test Case ${result.testIndex}\n`;
        output += `   Input: ${result.input}\n`;
        output += `   Expected: ${result.expectedOutput}\n`;
        output += `   Got: ${result.actualOutput || "(no output)"}\n`;
        if (result.executionTime) {
          output += `   ⏱️ Time: ${result.executionTime.toFixed(2)}ms\n`;
        }
        if (result.memoryUsed) {
          output += `   💾 Memory: ${(result.memoryUsed / 1024).toFixed(2)}KB\n`;
        }
        if (result.error) {
          output += `   ⚠️ Error: ${result.error}\n`;
        }
        output += "\n";
      });

      output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
      output += `📈 Summary: ${data.summary.passed}/${data.summary.totalTests} tests passed\n`;
      output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

      setTestOutput(output);

      const passedCount = data.summary.passed;
      
      const existingIdx = solutions.findIndex(s => s.questionId === currentQuestion.id);
      const newSolution: Solution = {
        questionId: currentQuestion.id,
        code,
        language: selectedLanguage,
        isCorrect: passedCount === currentQuestion.testCases.length,
        testsPassed: passedCount,
        totalTests: currentQuestion.testCases.length
      };
      
      if (existingIdx >= 0) {
        setSolutions(prev => {
          const updated = [...prev];
          updated[existingIdx] = newSolution;
          return updated;
        });
      } else {
        setSolutions(prev => [...prev, newSolution]);
      }
      
      if (data.summary.allPassed) {
        toast.success("🎉 All test cases passed!");
      } else {
        toast.warning(`${passedCount}/${currentQuestion.testCases.length} test cases passed`);
      }
    } catch (err) {
      console.error("Test execution error:", err);
      setTestOutput("❌ Failed to execute code. Please try again.");
      toast.error("Execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSubmitAll = useCallback(async () => {
    setLoading(true);
    stopMonitoring();
    
    await captureSnapshot();
    
    const problemsSolved = solutions.filter(s => s.isCorrect).length;
    const totalScore = solutions.reduce((acc, s) => {
      const question = questions.find(q => q.id === s.questionId);
      const baseScore = question?.difficulty === "Easy" ? 10 : question?.difficulty === "Medium" ? 20 : 30;
      return acc + (s.isCorrect ? baseScore : Math.floor(baseScore * (s.testsPassed / s.totalTests) * 0.5));
    }, 0);
    
    const maxScore = questions.reduce((acc, q) => {
      return acc + (q.difficulty === "Easy" ? 10 : q.difficulty === "Medium" ? 20 : 30);
    }, 0);
    
    const passed = totalScore >= maxScore * 0.5 && tabSwitchCount < MAX_TAB_SWITCHES;

    setResult({
      totalScore,
      problemsSolved,
      passed
    });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const testId = crypto.randomUUID();
        
        // Upload screen recording if available
        let screenRecordingUrl: string | undefined;
        const recordingBlob = getRecordingBlob();
        if (recordingBlob) {
          toast.info("Uploading screen recording...");
          const uploadResult = await uploadScreenRecording(user.id, testId, 'dsa', recordingBlob);
          if (uploadResult.success) {
            screenRecordingUrl = uploadResult.url;
            toast.success("Screen recording uploaded successfully");
          } else {
            console.error("Recording upload failed:", uploadResult.error);
          }
        }

        await supabase.from("dsa_round_results").insert({
          id: testId,
          user_id: user.id,
          total_score: totalScore,
          problems_attempted: solutions.length,
          problems_solved: problemsSolved,
          time_taken_seconds: 60 * 60 - timeLeft,
          difficulty: experienceYears <= 1 ? "Easy" : experienceYears <= 4 ? "Medium" : "Hard",
          passed,
          screen_recording_url: screenRecordingUrl,
          solutions: {
            responses: solutions,
            antiCheat: {
              tabSwitches: tabSwitchCount,
              violations: violations,
              webcamEnabled,
              fullscreenMaintained: isFullScreen,
              screenRecorded: isRecording,
              faceVerificationEnabled,
              faceViolations,
              audioViolations,
              lastFaceVerification: lastFaceVerification ? {
                faceDetected: lastFaceVerification.faceDetected,
                multipleFaces: lastFaceVerification.multipleFaces,
                matchesBaseline: lastFaceVerification.matchesBaseline,
                confidence: lastFaceVerification.confidence,
              } : null,
            }
          } as any
        });

        if (passed) {
          await supabase
            .from("verification_stages")
            .update({ status: "completed", score: totalScore, completed_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("stage_name", "dsa_round");
        } else {
          await supabase
            .from("verification_stages")
            .update({ status: "failed", score: totalScore })
            .eq("user_id", user.id)
            .eq("stage_name", "dsa_round");
        }
      }
    } catch (error: any) {
      toast.error("Failed to save results: " + error.message);
    }

    setStage("result");
    setLoading(false);
  }, [solutions, questions, timeLeft, experienceYears, tabSwitchCount, violations, webcamEnabled, isFullScreen, captureSnapshot, stopMonitoring, getRecordingBlob, isRecording, faceVerificationEnabled, faceViolations, audioViolations, lastFaceVerification]);

  const goToQuestion = (idx: number) => {
    if (code && questions[currentQuestionIndex]) {
      const existingIdx = solutions.findIndex(s => s.questionId === questions[currentQuestionIndex].id);
      if (existingIdx < 0) {
        setSolutions(prev => [...prev, {
          questionId: questions[currentQuestionIndex].id,
          code,
          language: selectedLanguage,
          isCorrect: false,
          testsPassed: 0,
          totalTests: questions[currentQuestionIndex].testCases.length
        }]);
      }
    }
    
    setCurrentQuestionIndex(idx);
    const existingSolution = solutions.find(s => s.questionId === questions[idx]?.id);
    if (existingSolution) {
      setCode(existingSolution.code);
      setSelectedLanguage(existingSolution.language);
    } else {
      // Load template for new question
      setCode(questions[idx]?.templates?.[selectedLanguage] || "");
    }
    setTestOutput("");
    setShowHint(false);
  };

  // Handle language change
  const handleLanguageChange = (lang: ProgrammingLanguage) => {
    const currentQuestion = questions[currentQuestionIndex];
    const existingSolution = solutions.find(s => s.questionId === currentQuestion?.id);
    
    // Only change template if no existing solution
    if (!existingSolution && currentQuestion?.templates?.[lang]) {
      setCode(currentQuestion.templates[lang]);
    }
    setSelectedLanguage(lang);
  };

  // Reset to template
  const resetToTemplate = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion?.templates?.[selectedLanguage]) {
      setCode(currentQuestion.templates[selectedLanguage]);
      toast.info("Code reset to template");
    }
  };

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
          <div className="flex flex-col gap-3">
            {cameraPermission === 'pending' && (
              <Button onClick={requestCameraPermission} size="lg" disabled={checkingCamera}>
                {checkingCamera ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking Camera...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4 mr-2" />
                    Enable Camera Access
                  </>
                )}
              </Button>
            )}

            {cameraPermission === 'denied' && (
              <Button onClick={requestCameraPermission} size="lg" variant="destructive">
                <Camera className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}

            {cameraPermission === 'granted' && (
              <Button onClick={proceedToIntro} size="lg">
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>

          {/* Proctoring info */}
          <div className="bg-muted/30 rounded-lg p-4 border border-border">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Proctoring Features Active
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Video className="h-3.5 w-3.5" />
                <span>Screen Recording</span>
              </div>
              <div className="flex items-center gap-2">
                <Camera className="h-3.5 w-3.5" />
                <span>Webcam Monitoring</span>
              </div>
              <div className="flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5" />
                <span>Fullscreen Mode</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Tab Switch Detection</span>
              </div>
            </div>
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
          <CardTitle className="text-2xl">Data Structures & Algorithms Round</CardTitle>
          <CardDescription>Demonstrate your problem-solving skills</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">Test Overview</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">3 Problems</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">60 Minutes</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">50% to Pass</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={experienceYears > 4 ? "destructive" : experienceYears > 1 ? "default" : "secondary"}>
                  {experienceYears <= 1 ? "Fresher" : experienceYears <= 4 ? "Intermediate" : "Experienced"} Level
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium">Problem Difficulty Distribution:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {experienceYears <= 1 ? (
                <>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-20 justify-center">Easy</Badge>
                    <span>2 problems (10 points each)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="default" className="w-20 justify-center">Medium</Badge>
                    <span>1 problem (20 points)</span>
                  </li>
                </>
              ) : experienceYears <= 4 ? (
                <>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-20 justify-center">Easy</Badge>
                    <span>1 problem (10 points)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="default" className="w-20 justify-center">Medium</Badge>
                    <span>2 problems (20 points each)</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-center gap-2">
                    <Badge variant="default" className="w-20 justify-center">Medium</Badge>
                    <span>1 problem (20 points)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="destructive" className="w-20 justify-center">Hard</Badge>
                    <span>2 problems (30 points each)</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Code className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-200">Coding Environment</p>
                <ul className="mt-2 text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Write your solution in any language (JavaScript/Python preferred)</li>
                  <li>• Test cases will be run against your code</li>
                  <li>• Partial scores awarded for passing some test cases</li>
                  <li>• Hints available (but use wisely!)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Proctoring reminder */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">Proctoring Enabled</p>
                <ul className="mt-2 text-amber-700 dark:text-amber-300 space-y-1">
                  <li>• Your screen will be recorded throughout the test</li>
                  <li>• Face verification will run periodically</li>
                  <li>• Maximum {MAX_TAB_SWITCHES} tab switches allowed</li>
                  <li>• Stay in fullscreen mode during the test</li>
                </ul>
              </div>
            </div>
          </div>

          <Button onClick={startTest} className="w-full" size="lg">
            <Code className="h-4 w-4 mr-2" />
            Start Test
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Test Screen
  if (stage === "test") {
    const currentQuestion = questions[currentQuestionIndex];
    const currentSolution = solutions.find(s => s.questionId === currentQuestion?.id);

    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <ViolationDialog />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Fullscreen: {isFullScreen ? "On" : "Off"}</span>
          <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
        </div>
        {!isFullScreen && (
          <div className="max-w-6xl mx-auto">
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
        
        {/* Anti-Cheat Overlay */}
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
          audioMonitoringEnabled={audioMonitoringEnabled}
          lastAudioDetection={lastAudioDetection}
          audioViolations={audioViolations}
        />

        {/* Header */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {questions.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => goToQuestion(idx)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      idx === currentQuestionIndex
                        ? "bg-primary text-primary-foreground"
                        : solutions.find(s => s.questionId === q.id)?.isCorrect
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : solutions.find(s => s.questionId === q.id)
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                            : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    Problem {idx + 1}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {q.difficulty}
                    </Badge>
                  </button>
                ))}
              </div>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                timeLeft < 600 ? "bg-destructive/10 text-destructive" : "bg-muted"
              }`}>
                <Clock className="h-5 w-5" />
                <span className="font-mono text-lg font-bold">{formatTime(timeLeft)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {/* Problem Description */}
          <Card className="h-[600px] overflow-hidden flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{currentQuestion?.title}</CardTitle>
                <Badge variant={
                  currentQuestion?.difficulty === "Easy" ? "secondary" : 
                  currentQuestion?.difficulty === "Medium" ? "default" : "destructive"
                }>
                  {currentQuestion?.difficulty}
                </Badge>
              </div>
              <Badge variant="outline" className="w-fit">{currentQuestion?.topic}</Badge>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{currentQuestion?.description}</p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Examples:</h4>
                {currentQuestion?.examples.map((ex, idx) => (
                  <div key={idx} className="bg-muted/50 rounded-lg p-3 mb-2 text-sm font-mono">
                    <p><strong>Input:</strong> {ex.input}</p>
                    <p><strong>Output:</strong> {ex.output}</p>
                    {ex.explanation && (
                      <p className="text-muted-foreground mt-1"><strong>Explanation:</strong> {ex.explanation}</p>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <h4 className="font-medium mb-2">Constraints:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {currentQuestion?.constraints.map((c, idx) => (
                    <li key={idx}>• {c}</li>
                  ))}
                </ul>
              </div>

              {showHint && currentQuestion?.hints && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <div className="text-sm">
                      {currentQuestion.hints.map((hint, idx) => (
                        <p key={idx} className="text-yellow-800 dark:text-yellow-200">{hint}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowHint(!showHint)}
                className="text-yellow-600"
              >
                <Lightbulb className="h-4 w-4 mr-2" />
                {showHint ? "Hide Hint" : "Show Hint"}
              </Button>
            </CardContent>
          </Card>

          {/* Code Editor */}
          <Card className="h-[600px] overflow-hidden flex flex-col">
            <Tabs defaultValue="code" className="flex-1 flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <TabsList>
                    <TabsTrigger value="code">Code</TabsTrigger>
                    <TabsTrigger value="output">
                      <Terminal className="h-3.5 w-3.5 mr-1" />
                      Output
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    <Select value={selectedLanguage} onValueChange={(val) => handleLanguageChange(val as ProgrammingLanguage)}>
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedLanguages.map((lang) => (
                          <SelectItem key={lang.language} value={lang.language}>
                            <span className="flex items-center gap-2">
                              <span>{getLanguageIcon(lang.language)}</span>
                              <span>{lang.displayName}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" onClick={resetToTemplate} title="Reset to template">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <TabsContent value="code" className="flex-1 mt-0 overflow-hidden">
                  <CodeEditor
                    value={code}
                    onChange={setCode}
                    language={selectedLanguage}
                    height="400px"
                  />
                </TabsContent>
                <TabsContent value="output" className="flex-1 mt-0">
                  <div className="h-[400px] bg-[#0a0a0f] text-green-400 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap overflow-auto border border-border">
                    {isExecuting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Executing code...</span>
                      </div>
                    ) : (
                      testOutput || "💡 Click 'Run Tests' to execute your code against test cases..."
                    )}
                  </div>
                </TabsContent>

                <div className="flex gap-3 mt-4">
                  <Button 
                    onClick={runTests} 
                    disabled={loading || isExecuting || !code.trim()}
                    variant="outline"
                    className="flex-1"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Run Tests
                      </>
                    )}
                  </Button>
                  <Button 
                    onClick={handleSubmitAll}
                    disabled={loading || isExecuting}
                    className="flex-1"
                  >
                    Submit
                  </Button>
                </div>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
    );
  }

  // Result Screen
  if (stage === "result") {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          {result.passed ? (
            <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
          ) : (
            <div className="w-20 h-20 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
          )}
          <CardTitle className="text-2xl">
            {result.passed ? "Excellent Work! 🎉" : "Keep Practicing!"}
          </CardTitle>
          <CardDescription>
            {result.passed
              ? "You have passed the DSA round!"
              : "Don't worry, you can retake the test after the cooldown period."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-primary">{result.totalScore}</p>
              <p className="text-sm text-muted-foreground">Total Score</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold">{result.problemsSolved}/{questions.length}</p>
              <p className="text-sm text-muted-foreground">Problems Solved</p>
            </div>
          </div>

          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-xl font-bold">{formatTime(60 * 60 - timeLeft)}</p>
            <p className="text-sm text-muted-foreground">Time Taken</p>
          </div>

          {/* Anti-cheat summary */}
          {(tabSwitchCount > 0 || faceViolations > 0 || audioViolations > 0) && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Proctoring Summary
              </h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                {tabSwitchCount > 0 && <li>• Tab switches: {tabSwitchCount}/{MAX_TAB_SWITCHES}</li>}
                {faceViolations > 0 && <li>• Face violations: {faceViolations}</li>}
                {audioViolations > 0 && <li>• Audio violations: {audioViolations}</li>}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-medium">Problem Summary:</h4>
            {solutions.map((sol, idx) => {
              const question = questions.find(q => q.id === sol.questionId);
              return (
                <div key={sol.questionId} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    {sol.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">{question?.title}</span>
                  </div>
                  <Badge variant={sol.isCorrect ? "default" : "secondary"}>
                    {sol.testsPassed}/{sol.totalTests} tests
                  </Badge>
                </div>
              );
            })}
          </div>

          <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
            {result.passed
              ? "Next step: proceed to the expert interview when you're ready."
              : "Next step: you can retry after the cooldown period. Review your solutions and try again."}
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
  }

  return null;
};

export default DSARoundStage;