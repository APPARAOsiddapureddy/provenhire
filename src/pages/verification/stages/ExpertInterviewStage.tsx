import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Mic, MicOff, Video, VideoOff, ArrowRight } from "lucide-react";

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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (e) {
      toast.error("Camera access denied. You can continue with typing.");
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

  const startVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input is not supported in this browser. Please type your answer.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (e: any) => {
      const parts = Array.from(e.results)
        .filter((r: any) => r.isFinal)
        .map((r: any) => r[0].transcript);
      if (parts.length) {
        const newPart = parts.join(" ");
        setAnswer((prev) => (prev ? prev + " " + newPart : newPart).trim());
      }
    };
    recognition.onerror = () => setMicActive(false);
    recognition.start();
    recognitionRef.current = recognition;
    setMicActive(true);
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Camera panel - left */}
              <div className="lg:col-span-1 space-y-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Face camera (proctoring)
                </div>
                <div className="aspect-video rounded-lg border-2 border-primary/30 bg-muted overflow-hidden relative">
                  {cameraActive ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      Camera off
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2">
                    <Button
                      size="sm"
                      variant={cameraActive ? "destructive" : "secondary"}
                      onClick={toggleCamera}
                    >
                      {cameraActive ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Question & answer - right */}
              <div className="lg:col-span-2 space-y-4">
                {question && (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Question {questionIndex} of {totalQuestions}</span>
                    </div>
                    <div className="rounded-lg border bg-muted/50 p-4 font-medium">
                      {question}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Your answer (type or use voice)</label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={micActive ? "destructive" : "outline"}
                        size="icon"
                        onClick={toggleVoice}
                        title={micActive ? "Stop voice input" : "Start voice input"}
                      >
                        {micActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                        <Input
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="Type your answer or click microphone to speak..."
                          className="flex-1"
                          disabled={loading}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={sendAnswer}
                        disabled={loading || !answer.trim() || !isFullScreen}
                      >
                        {loading ? "Submitting..." : "Submit & Next"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
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
