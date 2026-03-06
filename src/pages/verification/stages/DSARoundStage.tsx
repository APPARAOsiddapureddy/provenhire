import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import TestProctoringBar from "@/components/TestProctoringBar";
import ProctoringSetupGate from "@/components/ProctoringSetupGate";
import LiveProctoringPreview from "@/components/LiveProctoringPreview";
import SoundDetectedAlert from "@/components/SoundDetectedAlert";
import FullScreenMonitor from "@/components/FullScreenMonitor";
import type { ProctoringState } from "@/components/ProctoringSetupGate";
import { useSoundDetection } from "@/hooks/useSoundDetection";
import { useFullScreenState } from "@/hooks/useFullScreenState";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Play, Send, Loader2, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import CodeEditor from "@/components/CodeEditor";
import {
  generateDSATest,
  type DSAQuestion,
  type ProgrammingLanguage,
  supportedLanguages,
  DSA_TOTAL_MINUTES,
  DSA_MINUTES_PER_QUESTION,
} from "@/data/dsaQuestions";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface DSARoundStageProps {
  stageStatus?: string;
  stageScore?: number;
  onComplete: () => void;
  experienceYears?: number;
}

interface TestResult {
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
}

const DSARoundStage = ({ stageStatus, stageScore, onComplete, experienceYears = 2 }: DSARoundStageProps) => {
  const navigate = useNavigate();
  const [proctoringReady, setProctoringReady] = useState(false);
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [questions, setQuestions] = useState<DSAQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [code, setCode] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState<ProgrammingLanguage>("python");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [justPassed, setJustPassed] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);

  const inTest = proctoringReady && !justPassed && !hasFailed && questions.length > 0;
  const isFullScreen = useFullScreenState(inTest);

  useSoundDetection({
    enabled: inTest,
    threshold: 40,
    debounceMs: 4000,
    onSoundDetected: () => setSoundAlertOpen(true),
  });

  useEffect(() => {
    if (stageStatus !== "failed") setHasFailed(false);
  }, [stageStatus]);

  useEffect(() => {
    const q = generateDSATest(experienceYears);
    setQuestions(q);
    if (q.length > 0) {
      const initial: Record<string, string> = {};
      q.forEach((qu) => {
        initial[qu.id] = qu.templates[language] || qu.templates.python;
      });
      setCode(initial);
    }
  }, [experienceYears]);

  const selectedQuestion = questions[currentIndex];

  useEffect(() => {
    if (selectedQuestion) {
      setCode((prev) => ({
        ...prev,
        [selectedQuestion.id]:
          prev[selectedQuestion.id] ?? selectedQuestion.templates[language] ?? selectedQuestion.templates.python,
      }));
    }
  }, [selectedQuestion?.id]);

  useEffect(() => {
    if (selectedQuestion) {
      const tpl = selectedQuestion.templates[language] ?? selectedQuestion.templates.python;
      setCode((prev) => ({ ...prev, [selectedQuestion.id]: tpl }));
    }
  }, [language]);

  const runTests = async () => {
    if (!selectedQuestion) return;
    const currentCode = code[selectedQuestion.id] ?? selectedQuestion.templates[language];
    if (!currentCode?.trim()) {
      toast.error("Write some code first");
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const testResults: TestResult[] = [];
      for (const tc of selectedQuestion.testCases) {
        const res = await api.post<{ stdout: string; stderr: string; exitCode: number }>(
          "/api/execute",
          {
            language,
            code: currentCode,
            stdin: tc.input,
          }
        );
        const actual = (res.stdout || "").trim();
        const expected = (tc.expectedOutput || "").trim();
        const passed = normalizeOutput(actual) === normalizeOutput(expected);
        testResults.push({
          passed,
          input: tc.input.substring(0, 80) + (tc.input.length > 80 ? "…" : ""),
          expected,
          actual,
        });
      }
      setResults(testResults);
      const passed = testResults.filter((r) => r.passed).length;
      const total = testResults.length;
      const score = total > 0 ? Math.round((passed / total) * 100) : 0;
      setScores((prev) => ({ ...prev, [selectedQuestion.id]: score }));
      toast.success(`${passed}/${total} tests passed`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Execution failed";
      toast.error(msg);
      setResults([{ passed: false, input: "-", expected: "-", actual: msg }]);
    } finally {
      setRunning(false);
    }
  };

  const normalizeOutput = (s: string) =>
    s
      .replace(/\r\n/g, "\n")
      .trim()
      .replace(/\s+/g, " ");

  const ELIGIBILITY_THRESHOLD = 60;
  const isFailed = stageStatus === "failed";
  const isLastQuestion = currentIndex === questions.length - 1;
  const isFirstQuestion = currentIndex === 0;

  useEffect(() => {
    return () => {
      proctoringState?.cameraStream?.getTracks().forEach((t) => t.stop());
      proctoringState?.screenStream?.getTracks().forEach((t) => t.stop());
    };
  }, [proctoringState?.cameraStream, proctoringState?.screenStream]);

  useEffect(() => {
    if (justPassed || hasFailed) {
      proctoringState?.cameraStream?.getTracks().forEach((t) => t.stop());
      proctoringState?.screenStream?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, [justPassed, hasFailed, proctoringState]);

  const handleSubmitRound = async () => {
    const totalScore =
      questions.length > 0
        ? Math.round(
            questions.reduce((sum, q) => sum + (scores[q.id] ?? 0), 0) / questions.length
          )
        : 0;
    const finalScore = Math.min(100, Math.max(0, totalScore || 0));
    setSubmitting(true);
    try {
      const answers: Record<string, { code: string; language: string; score: number }> = {};
      questions.forEach((q) => {
        answers[q.id] = {
          code: code[q.id] ?? "",
          language,
          score: scores[q.id] ?? 0,
        };
      });
      await api.post("/api/verification/dsa", {
        score: finalScore,
        answers,
      });
      if (finalScore >= ELIGIBILITY_THRESHOLD) {
        await api.post("/api/verification/stages/update", {
          stageName: "dsa_round",
          status: "completed",
          score: finalScore,
        });
        toast.success(`DSA round completed. Score: ${finalScore}/100.`);
        setJustPassed(true);
      } else {
        setHasFailed(true);
        await api.post("/api/verification/stages/update", {
          stageName: "dsa_round",
          status: "failed",
          score: finalScore,
        });
        toast.error(`Score ${finalScore}/100. Minimum ${ELIGIBILITY_THRESHOLD} required to proceed. Use "Retry This Step" to try again.`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to submit DSA round.");
    } finally {
      setSubmitting(false);
      setSubmitConfirmOpen(false);
    }
  };

  if (questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>DSA Round</CardTitle>
          <CardDescription>Loading questions…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Please wait
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!proctoringReady) {
    return (
      <ProctoringSetupGate
        testName="DSA Round"
        onReady={(state) => {
          setProctoringState(state);
          setProctoringReady(true);
        }}
      />
    );
  }

  if (justPassed) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="p-6 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">DSA round passed! What&apos;s next?</h3>
            <p className="text-sm text-muted-foreground">You can go to the homepage or continue to the AI Expert Interview.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              <Button onClick={() => onComplete()}>
                Continue to AI Expert Interview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>DSA Round</CardTitle>
        <CardDescription>
          {questions.length > 0
            ? `Solve each problem one by one. Question ${currentIndex + 1} of ${questions.length}. Run tests for the current question, then move to the next. When done with all, submit the entire round. Minimum ${ELIGIBILITY_THRESHOLD}/100 to proceed.`
            : `Solve coding problems. Run tests and submit when ready. Minimum ${ELIGIBILITY_THRESHOLD}/100 to proceed.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SoundDetectedAlert open={soundAlertOpen} onOpenChange={setSoundAlertOpen} />
        <TestProctoringBar />
        {!isFullScreen && inTest && (
          <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Enter full screen to proceed to the next question or submit.
            </span>
            <FullScreenMonitor active={inTest} />
          </div>
        )}
        <LiveProctoringPreview
          cameraStream={proctoringState?.cameraStream ?? null}
          brandName="ProvenHire"
          position="top-right"
        />
        {isFailed && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your last score: {stageScore ?? 0}/100. Minimum {ELIGIBILITY_THRESHOLD} required. Improve your solutions and submit again, or use &quot;Retry This Step&quot; to reset.
            </p>
          </div>
        )}
        {/* Question progress */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <div className="flex gap-1">
            {questions.map((q, i) => (
              <div
                key={q.id}
                className={`w-2 h-2 rounded-full ${i === currentIndex ? "bg-primary" : scores[q.id] !== undefined ? "bg-green-500/70" : "bg-muted"}`}
                title={`Q${i + 1}: ${scores[q.id] !== undefined ? scores[q.id] + "%" : "Pending"}`}
              />
            ))}
          </div>
        </div>

        {selectedQuestion && (
          <>
            {/* Question description */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  {selectedQuestion.title}
                  <Badge variant="outline">{selectedQuestion.difficulty}</Badge>
                </h3>
                <p className="mt-2 text-sm whitespace-pre-wrap">{selectedQuestion.description}</p>
              </div>
              {/* Example: one input and one output for clarity */}
              {selectedQuestion.testCases.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Example</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md border border-border bg-background p-3">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input</span>
                      <pre className="mt-1 text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words">
                        {selectedQuestion.testCases[0].input}
                      </pre>
                    </div>
                    <div className="rounded-md border border-border bg-background p-3">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output</span>
                      <pre className="mt-1 text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words">
                        {selectedQuestion.testCases[0].expectedOutput}
                      </pre>
                    </div>
                  </div>
                  {selectedQuestion.testCases.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      + {selectedQuestion.testCases.length - 1} more test case(s) will run when you click Run tests
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Language selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Language:</span>
              <Select value={language} onValueChange={(v) => setLanguage(v as ProgrammingLanguage)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages.map((l) => (
                    <SelectItem key={l.language} value={l.language}>
                      {l.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Code editor */}
            <CodeEditor
              value={code[selectedQuestion.id] ?? selectedQuestion.templates[language]}
              onChange={(v) =>
                setCode((prev) => ({ ...prev, [selectedQuestion.id]: v }))
              }
              language={language}
              height="360px"
            />

            {/* Run tests & Navigate — clear separation from Submit entire round */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t">
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={runTests}
                  disabled={running || (inTest && !isFullScreen)}
                  variant="secondary"
                  size="lg"
                  className="font-medium"
                >
                  {running ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Run test cases
                </Button>
                {!isLastQuestion && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="font-medium"
                    onClick={() => {
                      setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
                      setResults(null);
                    }}
                    disabled={inTest && !isFullScreen}
                  >
                    Next question
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
                <Button
                  size="lg"
                  variant={isLastQuestion ? "default" : "outline"}
                  className="font-medium"
                  onClick={() => setSubmitConfirmOpen(true)}
                  disabled={submitting || (inTest && !isFullScreen)}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Submit entire round
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCurrentIndex((i) => Math.max(0, i - 1));
                    setResults(null);
                  }}
                  disabled={isFirstQuestion || (inTest && !isFullScreen)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
                    setResults(null);
                  }}
                  disabled={isLastQuestion || (inTest && !isFullScreen)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <AlertDialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogTitle>Submit entire round?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will submit your complete DSA round with all {questions.length} question(s). You cannot change your answers after submitting. Make sure you have run tests and reviewed your solutions. Continue?
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
                  <Button
                    onClick={() => handleSubmitRound()}
                    disabled={submitting}
                    className="bg-primary text-primary-foreground"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Submitting...
                      </>
                    ) : (
                      "Yes, submit entire round"
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Test results — clears when switching questions */}
            {results && (
              <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-2">
                <h4 className="font-medium text-sm text-foreground">Test results for Q{currentIndex + 1}</h4>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 text-sm p-2 rounded ${
                      r.passed ? "bg-green-500/10" : "bg-red-500/10"
                    }`}
                  >
                    {r.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-xs truncate">Input: {r.input}</div>
                      {!r.passed && (
                        <>
                          <div className="text-red-600">Expected: {r.expected}</div>
                          <div className="text-amber-600">Got: {r.actual}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DSARoundStage;
