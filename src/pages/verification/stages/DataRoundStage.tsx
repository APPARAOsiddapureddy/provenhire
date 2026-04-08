import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Play, Send, Loader2, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import CodeEditor from "@/components/CodeEditor";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface DataTask {
  id: string;
  title: string;
  description: string;
  taskType: "sql" | "python" | "modeling" | "statistics";
  difficulty: string;
  sqlSchema?: string;
  starterCode?: Record<string, string>;
  options?: string[];
  testCases: { input: string; expected: string }[];
}

interface TaskResult {
  passed: number;
  total: number;
  score: number;
  results: Array<{ passed: boolean; status: string; actual?: string; expected?: string }>;
}

interface DataRoundStageProps {
  stageStatus?: string;
  stageScore?: number;
  onComplete: () => void;
  onRetry?: () => void;
  isRetry?: boolean;
  nextStageLabel?: string;
}

export default function DataRoundStage({
  stageStatus,
  stageScore,
  onComplete,
  onRetry,
  isRetry,
  nextStageLabel,
}: DataRoundStageProps) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<DataTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTaskIdx, setCurrentTaskIdx] = useState(0);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, TaskResult>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [finalPassed, setFinalPassed] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [passThreshold, setPassThreshold] = useState(50);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/verification/data-round/tasks");
      const data = res.data;
      setTasks(data.tasks || []);
      setTimeLimitMinutes(data.timeLimitMinutes || 60);
      setPassThreshold(data.passThresholdPercent || 50);
      const starters: Record<string, string> = {};
      for (const t of data.tasks || []) {
        const lang = t.taskType === "sql" ? "sql" : "python";
        starters[t.id] = t.starterCode?.[lang] || "";
      }
      setCodes(starters);
      startTimeRef.current = Date.now();
      setTimeLeft((data.timeLimitMinutes || 60) * 60);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to load data round tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (stageStatus === "completed" || stageStatus === "failed") {
      setFinalized(true);
      setFinalScore(stageScore ?? null);
      setFinalPassed(stageStatus === "completed");
      return;
    }
    void loadTasks();
  }, [stageStatus, stageScore, loadTasks]);

  useEffect(() => {
    if (timeLeft == null || finalized) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev == null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft != null, finalized]);

  const handleSubmitTask = async (taskId: string) => {
    const code = codes[taskId] || "";
    if (!code.trim()) {
      toast.error("Write some code before submitting.");
      return;
    }
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setSubmitting(taskId);
    try {
      const res = await api.post("/api/verification/data-round/submit", {
        taskId,
        code,
        language: task.taskType === "sql" ? "sql" : "python",
      });
      setResults((prev) => ({ ...prev, [taskId]: res.data }));
      toast.success(`Task submitted: ${res.data.passed}/${res.data.total} test cases passed`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Submission failed");
    } finally {
      setSubmitting(null);
    }
  };

  const handleFinalize = async () => {
    try {
      const res = await api.post("/api/verification/data-round");
      setFinalScore(res.data.score);
      setFinalPassed(res.data.passed);
      setFinalized(true);
      if (res.data.passed) {
        toast.success("Data Round passed!");
      } else {
        toast.error(`Did not meet pass threshold (${res.data.passThresholdPercent}%). Try again after cooldown.`);
      }
      onComplete();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to finalize");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-lg">Loading Data Round tasks...</span>
      </div>
    );
  }

  if (finalized) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {finalPassed ? (
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            ) : (
              <XCircle className="h-6 w-6 text-red-500" />
            )}
            Data Round {finalPassed ? "Passed" : "Not Passed"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg">
            Score: <strong>{finalScore ?? stageScore ?? 0}/100</strong>
            {!finalPassed && ` (needed ${passThreshold}%)`}
          </p>
          {finalPassed && (
            <p className="text-muted-foreground">
              You have unlocked <strong>L1 — Cognitive Verified</strong>. Proceed to{" "}
              {nextStageLabel || "AI Skills Interview"} to continue.
            </p>
          )}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => navigate("/")}>
              Go to Homepage
            </Button>
            {finalPassed && (
              <Button onClick={onComplete}>
                Continue to {nextStageLabel || "AI Skills Interview"}
              </Button>
            )}
            {!finalPassed && onRetry && (
              <Button variant="secondary" onClick={onRetry}>
                Retry (after cooldown)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentTask = tasks[currentTaskIdx];
  const timeExpired = timeLeft != null && timeLeft <= 0;
  const allSubmitted = tasks.every((t) => results[t.id]);

  return (
    <div className="space-y-4">
      {/* Timer + Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Data Round — {tasks.length} Task{tasks.length !== 1 ? "s" : ""}
        </h2>
        <div className="flex items-center gap-4">
          <Badge variant={timeLeft != null && timeLeft < 300 ? "destructive" : "secondary"} className="text-base px-3 py-1">
            {timeLeft != null ? formatTime(timeLeft) : "--:--"}
          </Badge>
          <Badge variant="outline">{passThreshold}% to pass</Badge>
        </div>
      </div>

      {/* Task Navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {tasks.map((t, i) => (
          <Button
            key={t.id}
            variant={i === currentTaskIdx ? "default" : results[t.id] ? "secondary" : "outline"}
            size="sm"
            onClick={() => setCurrentTaskIdx(i)}
          >
            {i + 1}. {t.title.slice(0, 30)}
            {results[t.id] && (
              <span className="ml-1">
                {results[t.id]!.passed === results[t.id]!.total ? (
                  <CheckCircle2 className="inline h-3.5 w-3.5 text-green-500" />
                ) : (
                  <XCircle className="inline h-3.5 w-3.5 text-yellow-500" />
                )}
              </span>
            )}
          </Button>
        ))}
      </div>

      {currentTask && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Problem Description */}
          <Card className="overflow-auto max-h-[75vh]">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{currentTask.title}</CardTitle>
                <Badge variant={currentTask.difficulty === "Easy" ? "secondary" : currentTask.difficulty === "Hard" ? "destructive" : "default"}>
                  {currentTask.difficulty}
                </Badge>
                <Badge variant="outline">{currentTask.taskType.toUpperCase()}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm">{currentTask.description}</p>
              {currentTask.sqlSchema && (
                <div>
                  <h4 className="font-semibold text-sm mb-1">Schema:</h4>
                  <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">{currentTask.sqlSchema}</pre>
                </div>
              )}
              {currentTask.testCases.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-1">Example Test Cases:</h4>
                  {currentTask.testCases.map((tc, i) => (
                    <div key={i} className="bg-muted p-2 rounded text-xs mb-2">
                      {tc.input && <div><strong>Input:</strong> <pre className="inline">{tc.input}</pre></div>}
                      <div><strong>Expected:</strong> <pre className="inline">{tc.expected}</pre></div>
                    </div>
                  ))}
                </div>
              )}
              {results[currentTask.id] && (
                <div className="border-t pt-3">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
                    Results: {results[currentTask.id]!.passed}/{results[currentTask.id]!.total} passed
                    {results[currentTask.id]!.passed === results[currentTask.id]!.total ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-yellow-500" />
                    )}
                  </h4>
                  {results[currentTask.id]!.results.map((r, i) => (
                    <div key={i} className={`text-xs p-1.5 rounded mb-1 ${r.passed ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                      Test {i + 1}: {r.passed ? "PASS" : "FAIL"}
                      {r.actual !== undefined && !r.passed && (
                        <span className="block ml-2">Got: {r.actual?.slice(0, 200)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Code Editor */}
          <div className="flex flex-col gap-2">
            <div className="flex-1 min-h-[400px] border rounded-md overflow-hidden">
              <CodeEditor
                value={codes[currentTask.id] || ""}
                onChange={(val) => setCodes((prev) => ({ ...prev, [currentTask.id]: val || "" }))}
                language={currentTask.taskType === "sql" ? "sql" : "python"}
                height="100%"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentTaskIdx === 0}
                  onClick={() => setCurrentTaskIdx((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentTaskIdx >= tasks.length - 1}
                  onClick={() => setCurrentTaskIdx((i) => Math.min(tasks.length - 1, i + 1))}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleSubmitTask(currentTask.id)}
                  disabled={submitting === currentTask.id || timeExpired}
                >
                  {submitting === currentTask.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Run & Submit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Finalize */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          size="lg"
          onClick={handleFinalize}
          disabled={timeExpired && !allSubmitted}
        >
          <Send className="h-4 w-4 mr-2" />
          Finish Data Round
        </Button>
      </div>
    </div>
  );
}
