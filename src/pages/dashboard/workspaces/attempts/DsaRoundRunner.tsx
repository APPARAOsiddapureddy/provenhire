import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, PanelLeftClose, PanelLeftOpen, Play, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import CodeEditor from "@/components/CodeEditor";
import WorkspaceConfirmDialog from "@/components/WorkspaceConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supportedLanguages, type ProgrammingLanguage } from "@/data/dsaRoundConfig";
import RoundAttemptShell from "./RoundAttemptShell";
import RoundCompletionReceipt from "./RoundCompletionReceipt";
import type { ProctoringState } from "@/components/ProctoringSetupGate";

type DsaQuestion = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  examples: unknown;
  constraints: string[];
  starterCode: Partial<Record<ProgrammingLanguage, string>>;
};

type DsaSnapshot = {
  session: {
    id: string;
    secondsRemaining: number;
    activeQId: string | null;
    expired: boolean;
  };
  questions: DsaQuestion[];
  codeDrafts: Record<string, Partial<Record<ProgrammingLanguage, string>>>;
  officialSubmissions: Record<string, { code: string; language: ProgrammingLanguage; codeScore: number; finalScore: number | null }>;
  activeFollowUp: {
    questionId: string;
    secondsRemaining: number;
    answers: Record<string, string>;
    followUps: Array<{ followUpQuestionId: string; questionText: string; options: Record<string, string> }>;
  } | null;
  workspaceAttempt: {
    status: string;
    percentageScore?: number | null;
    weightedScore?: number | null;
    round: { name: string; order: number };
  };
};

type RunTestCase = {
  passed?: boolean;
  status?: string;
  input?: unknown;
  expected?: unknown;
  actual?: unknown;
  stdout?: unknown;
  stderr?: unknown;
};

type RunTestResult = {
  compiledSuccessfully: boolean;
  passed: number;
  total: number;
  compileError?: string;
  results: RunTestCase[];
};

function examplesToText(examples: unknown) {
  if (!Array.isArray(examples)) return "";
  return examples
    .map((example, index) => {
      const row = example as { input?: unknown; output?: unknown };
      return `Example ${index + 1}\nInput: ${String(row.input ?? "")}\nOutput: ${String(row.output ?? "")}`;
    })
    .join("\n\n");
}

function starterFor(question: DsaQuestion, language: ProgrammingLanguage) {
  return question.starterCode?.[language] ?? question.starterCode?.python ?? supportedLanguages.find((item) => item.language === language)?.template ?? "";
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value.replace(/\n$/, "");
  return JSON.stringify(value);
}

function DsaConsolePanel({ result, message }: { result: RunTestResult | null; message: string }) {
  if (!result) {
    return <div className="min-h-[120px] text-sm text-[var(--dash-text-muted)]">{message || "Run tests to see output."}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={result.compiledSuccessfully ? "bg-emerald-500/20 text-emerald-100" : "bg-red-500/20 text-red-100"}>
          {result.compiledSuccessfully ? "Compiled" : "Compile failed"}
        </Badge>
        <span className="font-mono text-sm text-[var(--dash-text-muted)]">
          Passed {result.passed}/{result.total}
        </span>
      </div>
      {result.compileError ? (
        <pre className="whitespace-pre-wrap rounded-md border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-100">
          {result.compileError}
        </pre>
      ) : null}
      <div className="space-y-3">
        {result.results.map((test, index) => {
          const passed = Boolean(test.passed);
          return (
            <div key={index} className="rounded-lg border border-[var(--dash-navy-border)] bg-white/[0.02] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[var(--dash-text-primary)]">Test case {index + 1}</div>
                <Badge variant="outline" className={passed ? "border-emerald-400/40 text-emerald-100" : "border-red-400/40 text-red-100"}>
                  {passed ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                  {test.status ?? (passed ? "Passed" : "Failed")}
                </Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs uppercase text-[var(--dash-text-muted)]">Input</div>
                  <pre className="whitespace-pre-wrap rounded-md bg-black/25 p-2 text-xs text-[var(--dash-text-primary)]">{displayValue(test.input)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-[var(--dash-text-muted)]">Expected</div>
                  <pre className="whitespace-pre-wrap rounded-md bg-black/25 p-2 text-xs text-[var(--dash-text-primary)]">{displayValue(test.expected)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-[var(--dash-text-muted)]">Actual</div>
                  <pre className="whitespace-pre-wrap rounded-md bg-black/25 p-2 text-xs text-[var(--dash-text-primary)]">{displayValue(test.actual ?? test.stdout ?? test.stderr)}</pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DsaRoundRunner({ workspaceCode, attemptId, sessionId, initialProctoringState }: { workspaceCode: string; attemptId: string; sessionId: string; initialProctoringState?: ProctoringState | null }) {
  const [snapshot, setSnapshot] = useState<DsaSnapshot | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [language, setLanguage] = useState<ProgrammingLanguage>("python");
  const [codeByQuestion, setCodeByQuestion] = useState<Record<string, Partial<Record<ProgrammingLanguage, string>>>>({});
  const [consoleMessage, setConsoleMessage] = useState("");
  const [runResult, setRunResult] = useState<RunTestResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [followUpIndex, setFollowUpIndex] = useState(0);
  const [problemsOpen, setProblemsOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);
  const [submitConfirm, setSubmitConfirm] = useState<"question" | "final" | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<DsaSnapshot>(`/api/session/dsa/${encodeURIComponent(sessionId)}`);
    setSnapshot(res);
    setCodeByQuestion(res.codeDrafts ?? {});
    const idx = res.session.activeQId ? res.questions.findIndex((question) => question.id === res.session.activeQId) : 0;
    setActiveIndex(idx >= 0 ? idx : 0);
    if (res.activeFollowUp) {
      const answers = res.activeFollowUp.answers ?? {};
      setFollowUpAnswers(answers);
      const firstUnanswered = res.activeFollowUp.followUps.findIndex((question) => !answers[question.followUpQuestionId]);
      setFollowUpIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    }
  }, [sessionId]);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load DSA session"));
  }, [load]);

  const current = snapshot?.questions[activeIndex] ?? null;
  const currentId = current?.id;
  const currentCode = current ? codeByQuestion[current.id]?.[language] ?? starterFor(current, language) : "";
  const isFinalized = snapshot?.workspaceAttempt.status === "completed" || snapshot?.workspaceAttempt.status === "auto_completed";
  const activeFollowUp = snapshot?.activeFollowUp ?? null;
  const activeFollowUpQuestion = activeFollowUp?.followUps[followUpIndex] ?? null;
  const activeFollowUpAnswered = activeFollowUpQuestion ? Boolean(followUpAnswers[activeFollowUpQuestion.followUpQuestionId]) : false;
  const allFollowUpsAnswered = activeFollowUp
    ? activeFollowUp.followUps.every((question) => Boolean(followUpAnswers[question.followUpQuestionId]))
    : false;
  const isLastFollowUp = activeFollowUp ? followUpIndex >= activeFollowUp.followUps.length - 1 : false;
  const completedQuestions = useMemo(
    () => Object.values(snapshot?.officialSubmissions ?? {}).filter((row) => row.finalScore != null).length,
    [snapshot?.officialSubmissions],
  );

  useEffect(() => {
    setFollowUpIndex((index) => {
      if (!activeFollowUp?.followUps.length) return 0;
      return Math.min(index, activeFollowUp.followUps.length - 1);
    });
  }, [activeFollowUp?.followUps.length]);

  const setCode = (code: string) => {
    if (!current) return;
    setCodeByQuestion((prev) => ({
      ...prev,
      [current.id]: { ...(prev[current.id] ?? {}), [language]: code },
    }));
  };

  const saveCode = useCallback(async () => {
    if (!currentId || isFinalized) return;
    await api.put(`/api/session/dsa/${encodeURIComponent(sessionId)}/code`, {
      questionId: currentId,
      language,
      code: currentCode,
    });
  }, [currentCode, currentId, isFinalized, language, sessionId]);

  useEffect(() => {
    if (!currentId || isFinalized) return;
    const timer = window.setTimeout(() => {
      saveCode().catch(() => {});
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [currentId, isFinalized, saveCode]);

  const moveTo = async (index: number) => {
    if (!snapshot?.questions[index]) return;
    setActiveIndex(index);
    setRunResult(null);
    setConsoleMessage("");
    await api.patch(`/api/session/dsa/${encodeURIComponent(sessionId)}`, { activeQId: snapshot.questions[index].id }).catch(() => {});
  };

  const runTests = async () => {
    if (!current) return;
    setBusy("run");
    try {
      const res = await api.post<RunTestResult>(
        `/api/session/dsa/${encodeURIComponent(sessionId)}/run-tests`,
        { questionId: current.id, language, code: currentCode },
      );
      setRunResult(res);
      setConsoleMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run tests");
    } finally {
      setBusy(null);
    }
  };

  const submitQuestion = async () => {
    if (!current) return;
    setBusy("question");
    try {
      const res = await api.post<{ passed: number; total: number }>(
        `/api/session/dsa/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(current.id)}/submit`,
        { language, code: currentCode },
      );
      setRunResult(null);
      setConsoleMessage(`Official submission passed ${res.passed}/${res.total}. Follow-up questions are now required.`);
      const follow = await api.post<DsaSnapshot["activeFollowUp"]>(
        `/api/session/dsa/${encodeURIComponent(sessionId)}/follow-up/${encodeURIComponent(current.id)}/start`,
        {},
      );
      setSnapshot((prev) => prev ? { ...prev, activeFollowUp: follow } : prev);
      setFollowUpAnswers(follow?.answers ?? {});
      setFollowUpIndex(0);
      setSubmitConfirm(null);
      toast.info("Answer follow-up questions to complete this problem.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit question");
    } finally {
      setBusy(null);
    }
  };

  const submitFollowUps = async () => {
    const active = snapshot?.activeFollowUp;
    if (!active) return;
    setBusy("followup");
    try {
      const res = await api.post<{ followUpScore: number; correctCount: number; totalCount: number }>(
        `/api/session/dsa/${encodeURIComponent(sessionId)}/follow-up/${encodeURIComponent(active.questionId)}/submit`,
        { answers: followUpAnswers },
      );
      toast.success(`Follow-ups complete: ${res.correctCount}/${res.totalCount}`);
      setConsoleMessage(`Follow-ups complete: ${res.correctCount}/${res.totalCount}.`);
      setRunResult(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit follow-ups");
    } finally {
      setBusy(null);
    }
  };

  const finalSubmit = async (auto = false) => {
    setBusy("final");
    try {
      const res = await api.post<DsaSnapshot>(`/api/session/dsa/${encodeURIComponent(sessionId)}/submit`, {});
      setSnapshot(res);
      setSubmitConfirm(null);
      toast.success(auto ? "DSA time expired. Round finalized." : "DSA round submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit DSA round");
    } finally {
      setBusy(null);
    }
  };

  if (!snapshot || !current) {
    return (
      <RoundAttemptShell workspaceCode={workspaceCode} attemptId={attemptId} sessionId={sessionId} testType="dsa" title="DSA Round" subtitle="Loading session" secondsRemaining={null} initialProctoringState={initialProctoringState}>
        <div className="min-h-[360px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--dash-gold)]" />
        </div>
      </RoundAttemptShell>
    );
  }

  return (
    <RoundAttemptShell
      workspaceCode={workspaceCode}
      attemptId={attemptId}
      sessionId={sessionId}
      testType="dsa"
      title={snapshot.workspaceAttempt.round.name}
      subtitle={`Problem ${activeIndex + 1} of ${snapshot.questions.length}`}
      secondsRemaining={snapshot.session.secondsRemaining}
      isFinalized={isFinalized}
      initialProctoringState={initialProctoringState}
      onExpired={() => {
        toast.info("DSA time expired. Finalizing saved work.");
        void load();
      }}
    >
      {isFinalized ? (
        <RoundCompletionReceipt
          workspaceCode={workspaceCode}
          score={snapshot.workspaceAttempt.percentageScore ?? 0}
          reportModule="coding"
        />
      ) : null}

      <AlertDialog
        open={Boolean(activeFollowUp)}
        onOpenChange={(open) => {
          if (!open && activeFollowUp) {
            toast.info("Answer all follow-up questions to complete this submitted problem.");
          }
        }}
      >
        <AlertDialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Answer follow-up questions</AlertDialogTitle>
            <AlertDialogDescription>
              These questions check your understanding of the submitted solution. Answer all questions to complete this problem.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {activeFollowUp ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    Question {followUpIndex + 1} of {activeFollowUp.followUps.length}
                  </Badge>
                  <Badge variant="outline" className="font-mono">
                    <Clock className="mr-1 h-3 w-3" />
                    {Math.floor(activeFollowUp.secondsRemaining / 60)}:{String(activeFollowUp.secondsRemaining % 60).padStart(2, "0")}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {activeFollowUp.followUps.map((question, index) => {
                    const answered = Boolean(followUpAnswers[question.followUpQuestionId]);
                    const active = index === followUpIndex;
                    return (
                      <span
                        key={question.followUpQuestionId}
                        className={`h-2.5 w-2.5 rounded-full border ${
                          active
                            ? "border-primary bg-primary"
                            : answered
                              ? "border-emerald-500 bg-emerald-500"
                              : "border-muted-foreground/40"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              {activeFollowUpQuestion ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-foreground">{activeFollowUpQuestion.questionText}</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {Object.entries(activeFollowUpQuestion.options).map(([key, value]) => {
                      const selected = followUpAnswers[activeFollowUpQuestion.followUpQuestionId] === value;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFollowUpAnswers((prev) => ({ ...prev, [activeFollowUpQuestion.followUpQuestionId]: value }))}
                          className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <span className="mr-2 font-semibold">{key}.</span>
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFollowUpIndex((index) => Math.max(0, index - 1))}
              disabled={busy === "followup" || followUpIndex === 0}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            {!isLastFollowUp ? (
              <Button
                type="button"
                onClick={() => setFollowUpIndex((index) => Math.min((activeFollowUp?.followUps.length ?? 1) - 1, index + 1))}
                disabled={busy === "followup" || !activeFollowUpAnswered}
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submitFollowUps} disabled={busy === "followup" || !allFollowUpsAnswered}>
                {busy === "followup" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit follow-ups
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={`grid grid-cols-1 gap-4 ${problemsOpen ? "xl:grid-cols-[360px_1fr]" : "xl:grid-cols-1"}`}>
        {problemsOpen ? (
        <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base text-[var(--dash-text-primary)]">Problems</CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={() => setProblemsOpen(false)} aria-label="Hide problems panel">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.questions.map((question, index) => {
              const official = snapshot.officialSubmissions[question.id];
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => moveTo(index)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    index === activeIndex ? "border-[var(--dash-gold)] bg-[var(--dash-gold)]/10" : "border-[var(--dash-navy-border)] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--dash-text-primary)]">{question.title}</span>
                    {official?.finalScore != null ? <Badge variant="outline">{official.finalScore}/100</Badge> : null}
                  </div>
                  <div className="text-xs text-[var(--dash-text-muted)]">{question.difficulty}</div>
                </button>
              );
            })}
            <Button className="w-full" onClick={() => setSubmitConfirm("final")} disabled={busy === "final" || completedQuestions < snapshot.questions.length || isFinalized}>
              {busy === "final" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Submit DSA Round
            </Button>
          </CardContent>
        </Card>
        ) : null}

        <div className="space-y-4">
          {!problemsOpen ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setProblemsOpen(true)}>
              <PanelLeftOpen className="mr-2 h-4 w-4" />
              Show problems
            </Button>
          ) : null}
          <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg text-[var(--dash-text-primary)]">{current.title}</CardTitle>
                  <div className="mt-1 text-xs text-[var(--dash-text-muted)]">{current.difficulty}</div>
                </div>
                <Select value={language} onValueChange={(value) => setLanguage(value as ProgrammingLanguage)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map((item) => (
                      <SelectItem key={item.language} value={item.language}>
                        {item.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm text-[var(--dash-text-primary)]">
                {current.description}
              </div>
              {examplesToText(current.examples) && (
                <pre className="rounded-lg border border-[var(--dash-navy-border)] bg-black/30 p-3 text-xs text-[var(--dash-text-muted)] overflow-x-auto">
                  {examplesToText(current.examples)}
                </pre>
              )}
              {current.constraints?.length ? (
                <ul className="list-disc pl-5 text-xs text-[var(--dash-text-muted)]">
                  {current.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}
                </ul>
              ) : null}
              <CodeEditor value={currentCode} onChange={setCode} language={language} readOnly={isFinalized} height="420px" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={runTests} disabled={Boolean(busy) || isFinalized}>
                  {busy === "run" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Run Tests
                </Button>
                <Button onClick={() => setSubmitConfirm("question")} disabled={Boolean(busy) || isFinalized || snapshot.officialSubmissions[current.id]?.finalScore != null}>
                  {busy === "question" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Submit Question
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--dash-navy-border)] bg-black/30">
            <CardHeader>
              <CardTitle className="text-base text-[var(--dash-text-primary)]">Console</CardTitle>
            </CardHeader>
            <CardContent>
              <DsaConsolePanel result={runResult} message={consoleMessage} />
            </CardContent>
          </Card>
        </div>
      </div>
      <WorkspaceConfirmDialog
        open={Boolean(submitConfirm)}
        title={submitConfirm === "question" ? "Submit this coding solution?" : "Submit the full DSA round?"}
        description={
          submitConfirm === "question"
            ? "You cannot resubmit this question after submission."
            : "You cannot edit completed answers after submitting the round."
        }
        confirmLabel="Yes, Submit"
        cancelLabel="No"
        loading={busy === "question" || busy === "final"}
        onOpenChange={(open) => {
          if (!open) setSubmitConfirm(null);
        }}
        onConfirm={() => {
          if (submitConfirm === "question") {
            void submitQuestion();
          } else if (submitConfirm === "final") {
            void finalSubmit(false);
          }
        }}
      />
    </RoundAttemptShell>
  );
}
