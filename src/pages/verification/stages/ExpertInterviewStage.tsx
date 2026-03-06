import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import TestProctoringBar from "@/components/TestProctoringBar";
import SoundDetectedAlert from "@/components/SoundDetectedAlert";
import FullScreenMonitor from "@/components/FullScreenMonitor";
import { useSoundDetection } from "@/hooks/useSoundDetection";
import { useFullScreenState } from "@/hooks/useFullScreenState";
import { Mic, MicOff, Video, VideoOff, ArrowRight, CheckCircle2 } from "lucide-react";

const INTERVIEW_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Data Analyst",
  "Data Scientist",
  "DevOps Engineer",
  "ML Engineer",
  "Mobile Developer",
  "QA Engineer",
  "Software Engineer",
  "Product Manager",
  "Project Manager",
  "Other Technical Role",
];

interface ExpertInterviewStageProps {
  targetJobTitle?: string;
  onComplete: () => void;
  onReturnToDashboard?: () => void;
}

const ExpertInterviewStage = ({
  targetJobTitle = "",
  onComplete,
  onReturnToDashboard,
}: ExpertInterviewStageProps) => {
  const [jobRole, setJobRole] = useState(
    targetJobTitle && INTERVIEW_ROLES.includes(targetJobTitle)
      ? targetJobTitle
      : targetJobTitle
        ? "Other Technical Role"
        : "Frontend Developer"
  );
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions] = useState(10);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);

  const inTest = !!interviewId && !result;
  const isFullScreen = useFullScreenState(inTest);

  useSoundDetection({
    enabled: inTest,
    threshold: 40,
    debounceMs: 4000,
    onSoundDetected: () => setSoundAlertOpen(true),
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (targetJobTitle && INTERVIEW_ROLES.includes(targetJobTitle)) {
      setJobRole(targetJobTitle);
    }
  }, [targetJobTitle]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Sync stream to video when camera becomes active (video mounts after cameraActive is true)
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (e) {
      toast.error("Camera access denied. Please allow camera in browser settings and try again.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const toggleCamera = () => {
    if (cameraActive) stopCamera();
    else startCamera();
  };

  const startVoiceInput = async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input is not supported in this browser. Use Chrome or Edge. You can type your answer.");
      return;
    }
    try {
      // Request microphone permission first (required by some browsers)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      toast.error("Microphone access denied. Please allow microphone to use voice input, or type your answer.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (e: any) => {
      const parts = Array.from(e.results)
        .filter((r: any) => r.isFinal)
        .map((r: any) => r[0]?.transcript)
        .filter(Boolean);
      if (parts.length) {
        const newPart = parts.join(" ");
        setAnswer((prev) => (prev ? prev + " " + newPart : newPart).trim());
      }
    };
    recognition.onerror = (e: any) => {
      setMicActive(false);
      recognitionRef.current = null;
      if (e.error === "not-allowed") {
        toast.error("Microphone access denied. You can type your answer.");
      } else if (e.error === "no-speech") {
        // User didn't speak - no need to toast
      } else if (e.error !== "aborted") {
        console.warn("[SpeechRecognition] error:", e.error);
      }
    };
    recognition.onend = () => {
      if (micActive && recognitionRef.current === recognition) {
        setMicActive(false);
        recognitionRef.current = null;
      }
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setMicActive(true);
    } catch (e) {
      toast.error("Could not start voice input. Please type your answer.");
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setMicActive(false);
  };

  const toggleVoice = () => {
    if (micActive) stopVoiceInput();
    else startVoiceInput();
  };

  const startInterview = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen may fail; proceed anyway
    }
    setLoading(true);
    try {
      const role = jobRole === "Other Technical Role" ? (targetJobTitle || "Software Engineer") : jobRole;
      const res = await api.post<{ interviewId: string; question: string; questionIndex?: number; totalQuestions?: number }>(
        "/api/interview/start",
        { jobRole: role }
      );
      setInterviewId(res.interviewId);
      setQuestion(res.question);
      setQuestionIndex(res.questionIndex ?? 1);
      if (!cameraActive) startCamera();
    } catch (error: any) {
      toast.error(error?.message || "Failed to start interview.");
    } finally {
      setLoading(false);
    }
  };

  const sendAnswer = async () => {
    if (!interviewId || !answer.trim()) return;
    setLoading(true);
    try {
      const res = await api.post<any>("/api/interview/respond", {
        interviewId,
        answer: answer.trim(),
      });
      setAnswer("");
      if (micActive) stopVoiceInput();
      if (res.completed) {
        setResult(res);
        stopCamera();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        await api.post("/api/verification/stages/update", { stageName: "expert_interview", status: "completed" });
        onComplete();
      } else {
        setQuestion(res.question);
        setQuestionIndex(res.questionIndex ?? 0);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit answer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SoundDetectedAlert open={soundAlertOpen} onOpenChange={setSoundAlertOpen} />
      <TestProctoringBar />
      {!isFullScreen && inTest && (
        <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Enter full screen to proceed to the next question or submit.
          </span>
          <FullScreenMonitor active={inTest} exitMessage="Please stay in full screen during the interview." />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>AI Expert Interview</CardTitle>
          <CardDescription>
            Answer 10 questions (7 role-specific + 3 HR). Use voice or type. Camera is on for proctoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!interviewId ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Your role (for tailored questions)</label>
                <Select value={jobRole} onValueChange={setJobRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={startInterview} disabled={loading}>
                  {loading ? "Starting..." : "Start Interview"}
                </Button>
                {onReturnToDashboard && (
                  <Button variant="outline" onClick={onReturnToDashboard}>
                    Return to Dashboard
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 1. Question at top */}
              {question && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Question {questionIndex} of {totalQuestions}
                    </span>
                  </div>
                  <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 font-medium text-lg">
                    {question}
                  </div>

                  {/* 2. Camera in middle - prominent so user sees their face */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Video className="h-4 w-4" />
                      Your camera — you&apos;ll see yourself as in a real interview
                    </div>
                    <div className="aspect-video max-w-2xl mx-auto rounded-xl border-2 border-primary/30 bg-muted overflow-hidden relative shadow-lg">
                      {cameraActive ? (
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                          <Video className="h-12 w-12 opacity-50" />
                          <p className="text-sm font-medium">Camera off</p>
                          <Button variant="secondary" size="sm" onClick={toggleCamera}>
                            <Video className="h-4 w-4 mr-2" />
                            Turn on camera
                          </Button>
                        </div>
                      )}
                      {cameraActive && (
                        <div className="absolute bottom-2 right-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={toggleCamera}
                          >
                            <VideoOff className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Answer section - voice recording prominent */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium block">
                      Your answer — speak or type
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        type="button"
                        variant={micActive ? "destructive" : "default"}
                        size="lg"
                        className="shrink-0 font-semibold"
                        onClick={toggleVoice}
                      >
                        {micActive ? (
                          <>
                            <MicOff className="h-5 w-5 mr-2" />
                            Stop recording
                          </>
                        ) : (
                          <>
                            <Mic className="h-5 w-5 mr-2" />
                            Click to speak your answer
                          </>
                        )}
                      </Button>
                      <span className="text-sm text-muted-foreground self-center">
                        {micActive ? "Speaking… Your words appear below." : "Or type in the box below."}
                      </span>
                    </div>
                    <Textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Your answer will appear here when you speak, or type directly..."
                      className="min-h-[120px] text-base"
                      disabled={loading}
                    />

                    {/* 4. Review & submit step */}
                    {answer.trim() && (
                      <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-primary font-medium">
                          <CheckCircle2 className="h-5 w-5" />
                          Review your answer
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Read your answer above. Edit if needed, then click Submit to continue to the next question.
                        </p>
                        <Button
                          onClick={sendAnswer}
                          disabled={loading || !isFullScreen}
                          size="lg"
                        >
                          {loading ? "Submitting..." : "Submit & go to next question"}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <h4 className="font-semibold mb-2">Interview completed</h4>
              <p className="text-sm text-muted-foreground">
                Score: <strong>{result.totalScore}</strong> — {result.badgeLevel}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpertInterviewStage;
