import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Play, Send, Loader2, CheckCircle2, XCircle } from "lucide-react";
import CodeEditor from "@/components/CodeEditor";
import {
  generateDSATest,
  type DSAQuestion,
  type ProgrammingLanguage,
  supportedLanguages,
} from "@/data/dsaQuestions";

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
  const [questions, setQuestions] = useState<DSAQuestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [code, setCode] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState<ProgrammingLanguage>("python");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});

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

  const selectedQuestion = questions[selectedIndex];

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

  const handleSubmit = async () => {
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
        toast.success(`DSA round completed. Score: ${finalScore}/100. You are eligible for the AI interview.`);
        onComplete();
      } else {
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

  const isFailed = stageStatus === "failed";

  return (
    <Card>
      <CardHeader>
        <CardTitle>DSA Round</CardTitle>
        <CardDescription>
          Solve {questions.length} coding problem(s). Run tests and submit when ready. Minimum {ELIGIBILITY_THRESHOLD}/100 to proceed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isFailed && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your last score: {stageScore ?? 0}/100. Minimum {ELIGIBILITY_THRESHOLD} required. Improve your solutions and submit again, or use &quot;Retry This Step&quot; to reset.
            </p>
          </div>
        )}
        {/* Question tabs */}
        <div className="flex flex-wrap gap-2">
          {questions.map((q, i) => (
            <Button
              key={q.id}
              variant={selectedIndex === i ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedIndex(i)}
            >
              Q{i + 1}: {q.title}
              {scores[q.id] !== undefined && (
                <Badge variant="secondary" className="ml-2">
                  {scores[q.id]}%
                </Badge>
              )}
            </Button>
          ))}
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

            {/* Run & Submit */}
            <div className="flex gap-2">
              <Button onClick={runTests} disabled={running} variant="secondary">
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Run tests
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Submit round
              </Button>
            </div>

            {/* Test results */}
            {results && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <h4 className="font-medium text-sm">Test results</h4>
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
