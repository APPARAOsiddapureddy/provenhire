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
import { useAuth } from "@/contexts/AuthContext";
import TestProctoringBar from "@/components/TestProctoringBar";
import SoundDetectedAlert from "@/components/SoundDetectedAlert";
import FullScreenMonitor from "@/components/FullScreenMonitor";
import { useSoundDetection } from "@/hooks/useSoundDetection";
import { useFullScreenState } from "@/hooks/useFullScreenState";
import { useProctoringRiskMonitor } from "@/hooks/useProctoringRiskMonitor";
import { useProctorFrameCapture } from "@/hooks/useProctorFrameCapture";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
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
  const { user } = useAuth();
  const fallbackTestIdRef = useRef(`AI_INTERVIEW_${Date.now()}`);
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
  const [totalQuestions, setTotalQuestions] = useState(11);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordedAudioRef = useRef<Blob | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const inTest = !!interviewId && !result;
  const isFullScreen = useFullScreenState(inTest);
  const { getMode: getFlagMode } = useFeatureFlags();
  const isFlagEnabled = (name: string) => getFlagMode(name) === "MONITOR" || getFlagMode(name) === "STRICT";
  const tabSwitchMode = getFlagMode("tab_switch_detection");
  const tabSwitchDetectionEnabled = isFlagEnabled("tab_switch_detection");
  const fullscreenRequired = isFlagEnabled("fullscreen_required");
  const effectivelyFullScreen = !fullscreenRequired || isFullScreen;
  const { riskLevel, riskScore } = useProctoringRiskMonitor({
    enabled: inTest,
    candidateId: user?.id,
    testId: interviewId ?? fallbackTestIdRef.current,
    testType: "ai_interview",
    cameraStream: cameraActive ? streamRef.current : null,
    microphoneStream: null,
    tabSwitchDetectionEnabled,
    copyPasteDetectionEnabled: isFlagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: isFlagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: isFlagEnabled("fullscreen_required"),
    multipleFaceDetectionEnabled: isFlagEnabled("multiple_face_detection"),
    microphoneMonitoringEnabled: isFlagEnabled("microphone_monitoring"),
    maxTabSwitches: tabSwitchMode === "STRICT" ? 3 : 999,
  });

  // Voice/sound detection OFF for AI interview — speaking is expected when answering.
  useSoundDetection({ enabled: false });

  useProctorFrameCapture({
    enabled: inTest && cameraActive && isFlagEnabled("screen_recording_enabled"),
    sessionId: interviewId ?? fallbackTestIdRef.current,
    testType: "ai_interview",
    cameraStream: cameraActive ? streamRef.current : null,
  });

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // MediaRecorder: record audio only (no video storage)
      audioChunksRef.current = [];
      recordedAudioRef.current = null;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (e: any) => {
        let newText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            newText += e.results[i][0]?.transcript ?? "";
          }
        }
        if (newText.trim()) {
          setAnswer((prev) => (prev ? prev + " " + newText.trim() : newText.trim()));
        }
      };
      recognition.onerror = (e: any) => {
        setMicActive(false);
        recognitionRef.current = null;
        if (e.error === "not-allowed") {
          toast.error("Microphone access denied. You can type your answer.");
        } else if (e.error === "no-speech") {
          // no toast needed
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
      recognition.start();
      recognitionRef.current = recognition;
      setMicActive(true);
    } catch (e) {
      toast.error("Microphone access denied. Please allow microphone to use voice input, or type your answer.");
    }
  };

  const stopVoiceInput = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const finish = (blob: Blob | null) => {
        audioStreamRef.current?.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        }
        setMicActive(false);
        resolve(blob);
      };
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.onstop = () => {
          let blob: Blob | null = null;
          if (audioChunksRef.current.length > 0) {
            const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
            blob = new Blob(audioChunksRef.current, { type: mime });
          }
          mediaRecorderRef.current = null;
          finish(blob);
        };
        mediaRecorderRef.current.stop();
      } else {
        finish(recordedAudioRef.current);
      }
    });
  };

  const toggleVoice = async () => {
    if (micActive) {
      const blob = await stopVoiceInput();
      recordedAudioRef.current = blob;
    } else {
      startVoiceInput();
    }
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
      if (res.totalQuestions != null) setTotalQuestions(res.totalQuestions);
      if (!cameraActive) startCamera();
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { error?: string; code?: string } } };
      const msg = err.response?.data?.error ?? (error instanceof Error ? error.message : "Failed to start interview.");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const sendAnswer = async () => {
    if (!interviewId || !answer.trim()) return;
    setLoading(true);
    try {
      let audioUrl: string | undefined;
      if (micActive) {
        const blob = await stopVoiceInput();
        recordedAudioRef.current = blob;
      }
      if (recordedAudioRef.current) {
        const formData = new FormData();
        formData.append("file", recordedAudioRef.current, "answer.webm");
        const uploadRes = await api.post<{ url: string }>("/api/uploads", formData);
        audioUrl = uploadRes.url;
        recordedAudioRef.current = null;
      }
      const res = await api.post<any>("/api/interview/respond", {
        interviewId,
        answer: answer.trim(),
        ...(audioUrl && { audioUrl: `${window.location.origin}${audioUrl}` }),
      });
      setAnswer("");
      if (res.completed) {
        setResult(res);
        stopCamera();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        const aiScore = typeof res.totalScore === "number" ? Math.round(res.totalScore) : undefined;
        await api.post("/api/verification/stages/update", {
          stageName: "expert_interview",
          status: "completed",
          score: aiScore,
        });
        onComplete();
      } else {
        setQuestion(res.question);
        setQuestionIndex(res.questionIndex ?? 0);
        if (res.totalQuestions != null) setTotalQuestions(res.totalQuestions);
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
      <TestProctoringBar showTabSwitch={tabSwitchDetectionEnabled} />
      {!effectivelyFullScreen && inTest && fullscreenRequired && (
        <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Enter full screen to proceed to the next question or submit.
          </span>
          <FullScreenMonitor active={inTest && fullscreenRequired} exitMessage="Please stay in full screen during the interview." />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>AI Expert Interview</CardTitle>
          <CardDescription>
            Answer 11 questions (7 role-specific + 4 HR). Use voice or type. Camera is on for proctoring.
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
                    <div className="flex items-center gap-2 px-3 py-1 rounded-md border bg-muted/40">
                      <span className="text-xs text-muted-foreground">Risk</span>
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide ${
                          riskLevel === "high_risk"
                            ? "text-red-500"
                            : riskLevel === "suspicious"
                              ? "text-amber-500"
                              : "text-emerald-600"
                        }`}
                      >
                        {riskLevel.replace("_", " ")}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">({riskScore})</span>
                    </div>
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
                          disabled={loading || !effectivelyFullScreen}
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
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <h4 className="font-semibold">Interview completed</h4>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">
                  Total score: <strong className="text-lg">{result.totalScore ?? 0}/100</strong>
                </span>
                <span className="badge bg-primary/20 text-primary px-2 py-0.5 rounded">{result.badgeLevel ?? "Not Verified"}</span>
              </div>
              {result.evaluation && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  {result.evaluation.concept_score != null && (
                    <div className="rounded bg-muted/50 px-2 py-1">
                      <span className="text-muted-foreground">Concept</span> {result.evaluation.concept_score}
                    </div>
                  )}
                  {result.evaluation.reasoning_score != null && (
                    <div className="rounded bg-muted/50 px-2 py-1">
                      <span className="text-muted-foreground">Reasoning</span> {result.evaluation.reasoning_score}
                    </div>
                  )}
                  {result.evaluation.communication_score != null && (
                    <div className="rounded bg-muted/50 px-2 py-1">
                      <span className="text-muted-foreground">Communication</span> {result.evaluation.communication_score}
                    </div>
                  )}
                  {result.evaluation.confidence_score != null && (
                    <div className="rounded bg-muted/50 px-2 py-1">
                      <span className="text-muted-foreground">Confidence</span> {result.evaluation.confidence_score}
                    </div>
                  )}
                </div>
              )}
              {result.evaluation?.final_verdict && (
                <p className="text-sm">{result.evaluation.final_verdict}</p>
              )}
              {Array.isArray(result.evaluation?.strengths) && result.evaluation.strengths.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-emerald-600">Strengths:</span>
                  <ul className="list-disc list-inside text-sm text-muted-foreground">{result.evaluation.strengths.map((s: string) => <li key={s}>{s}</li>)}</ul>
                </div>
              )}
              {Array.isArray(result.evaluation?.weaknesses) && result.evaluation.weaknesses.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-amber-600">Areas to improve:</span>
                  <ul className="list-disc list-inside text-sm text-muted-foreground">{result.evaluation.weaknesses.map((w: string) => <li key={w}>{w}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExpertInterviewStage;
