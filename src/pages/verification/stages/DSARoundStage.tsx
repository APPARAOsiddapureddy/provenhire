import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import ProctoringSetupGate from "@/components/ProctoringSetupGate";
import FullScreenMonitor from "@/components/FullScreenMonitor";
import type { ProctoringState } from "@/components/ProctoringSetupGate";
import { useSoundDetection } from "@/hooks/useSoundDetection";
import { useFullScreenState } from "@/hooks/useFullScreenState";
import { useProctoringRiskMonitor, type ProctoringEventCode, type StrikeTerminationMode } from "@/hooks/useProctoringRiskMonitor";
import { useProctorFrameCapture } from "@/hooks/useProctorFrameCapture";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Play, Send, Loader2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, CircleHelp, Lock, Camera, Shield, Volume2 } from "lucide-react";
import CodeEditor from "@/components/CodeEditor";
import {
  supportedLanguages,
  type ProgrammingLanguage,
  DSA_TOTAL_MINUTES,
  DSA_MINUTES_PER_QUESTION,
  DSA_PASS_THRESHOLD,
} from "@/data/dsaRoundConfig";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface DSARoundStageProps {
  stageStatus?: string;
  stageScore?: number;
  onComplete: () => void;
  onRetry?: () => void;
  isRetry?: boolean;
  targetJobTitle?: string | null;
  experienceYears?: number;
}

type TestResultStatus =
  | "passed"
  | "wrong_answer"
  | "compile_error"
  | "runtime_error"
  | "time_limit_exceeded"
  | "memory_limit_exceeded"
  | "internal_error";

interface TestResult {
  passed: boolean;
  status?: TestResultStatus;
  input?: string;
  expected?: string;
  actual?: string;
}

function statusLabel(s?: TestResultStatus): string {
  const labels: Record<TestResultStatus, string> = {
    passed: "Passed",
    wrong_answer: "Wrong Answer",
    compile_error: "Compile Error",
    runtime_error: "Runtime Error",
    time_limit_exceeded: "Time Limit Exceeded",
    memory_limit_exceeded: "Memory Limit Exceeded",
    internal_error: "Internal Error",
  };
  return s ? labels[s] : "";
}

function statusBadgeClass(s?: TestResultStatus, passed?: boolean): string {
  if (passed) return "bg-green-600/15 text-green-700 border-green-600/30";
  switch (s) {
    case "compile_error":
      return "bg-orange-500/15 text-orange-800 border-orange-500/30";
    case "time_limit_exceeded":
    case "memory_limit_exceeded":
      return "bg-amber-500/15 text-amber-900 border-amber-500/30";
    case "internal_error":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-red-600/15 text-red-800 border-red-600/30";
  }
}

type ApiDSAExample = {
  input: string;
  output: string;
  explanation?: string;
};

type ApiDSAQuestion = {
  id: string;
  difficulty: string;
  title: string;
  description: string;
  examples: ApiDSAExample[];
  constraints: string[];
  starterCode: Record<string, string>;
};

function defaultStarter(lang: ProgrammingLanguage): string {
  switch (lang) {
    case "python":
      return `# Write your solution in the solve() function.
# Read input from STDIN and write output to STDOUT.

def solve():
    # TODO: implement
    pass

if __name__ == "__main__":
    solve()
`;
    case "javascript":
      return `// Read input from STDIN and write output to STDOUT.
// Implement your logic inside solve().

function solve(input) {
  // TODO: implement
  return "";
}

const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
process.stdout.write(String(solve(input)));
`;
    case "java":
      return `import java.io.*;
import java.util.*;

public class Main {
  // Read input from STDIN and write output to STDOUT.
  public static void main(String[] args) throws Exception {
    FastScanner fs = new FastScanner(System.in);
    // TODO: parse input
    // TODO: implement solution
    // System.out.print(answer);
  }

  static class FastScanner {
    private final InputStream in;
    private final byte[] buffer = new byte[1 << 16];
    private int ptr = 0, len = 0;
    FastScanner(InputStream is) { in = is; }
    private int read() throws IOException {
      if (ptr >= len) {
        len = in.read(buffer);
        ptr = 0;
        if (len <= 0) return -1;
      }
      return buffer[ptr++];
    }
    String next() throws IOException {
      StringBuilder sb = new StringBuilder();
      int c;
      while ((c = read()) != -1 && c <= ' ') {}
      if (c == -1) return null;
      do {
        sb.append((char)c);
        c = read();
      } while (c != -1 && c > ' ');
      return sb.toString();
    }
    String nextLine() throws IOException {
      StringBuilder sb = new StringBuilder();
      int c;
      while ((c = read()) != -1 && c == '\r') {}
      if (c == -1) return null;
      while (c != -1 && c != '\n') {
        if (c != '\r') sb.append((char)c);
        c = read();
      }
      return sb.toString();
    }
    Integer nextInt() throws IOException {
      String s = next();
      return s == null ? null : Integer.parseInt(s);
    }
    Long nextLong() throws IOException {
      String s = next();
      return s == null ? null : Long.parseLong(s);
    }
  }
}
`;
    case "cpp":
      return `#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  // TODO: parse input from stdin
  // TODO: implement solution
  // cout << answer;

  return 0;
}
`;
    case "c":
      return `#include <stdio.h>

int main() {
  // TODO: parse input from stdin
  // TODO: implement solution
  // printf("%d\\n", answer);
  return 0;
}
`;
  }
}

function getStarterForQuestion(q: ApiDSAQuestion, lang: ProgrammingLanguage): string {
  const fromApi = q.starterCode?.[lang];
  if (typeof fromApi === "string" && fromApi.trim().length > 0) return fromApi;
  // Do not fall back to Python for C++/Java — it confuses candidates. Use a language-appropriate boilerplate.
  const pythonFallback = q.starterCode?.python;
  if (lang === "python" && typeof pythonFallback === "string" && pythonFallback.trim().length > 0) return pythonFallback;
  return defaultStarter(lang);
}

const DSARoundStage = ({ stageStatus, stageScore, onComplete, onRetry, isRetry = false, targetJobTitle, experienceYears = 2 }: DSARoundStageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const testIdRef = useRef<string>(`DSA_${Date.now()}`);
  const [proctoringReady, setProctoringReady] = useState(false);
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [questions, setQuestions] = useState<ApiDSAQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  /** Per-question, per-language editor buffer — switching language does not wipe other tabs. */
  const [codeByLang, setCodeByLang] = useState<Record<string, Partial<Record<ProgrammingLanguage, string>>>>({});
  const [language, setLanguage] = useState<ProgrammingLanguage>("python");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [compileErrorPanel, setCompileErrorPanel] = useState<string | null>(null);
  const [outputTab, setOutputTab] = useState<"results" | "console">("results");
  const [consoleText, setConsoleText] = useState<string>("");
  const [langSwitchOpen, setLangSwitchOpen] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<ProgrammingLanguage | null>(null);
  /** Final graded submission per question (locks editor for that question). */
  const [officialByQuestion, setOfficialByQuestion] = useState<
    Record<string, { code: string; language: ProgrammingLanguage; score: number }>
  >({});
  const [submitQuestionConfirmOpen, setSubmitQuestionConfirmOpen] = useState(false);
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [justPassed, setJustPassed] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [localFinalScore, setLocalFinalScore] = useState<number | null>(null);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [hasEvaluatedQuestions, setHasEvaluatedQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questionsReloadKey, setQuestionsReloadKey] = useState(0);
  const [noDsaSubmitting, setNoDsaSubmitting] = useState(false);
  const [questionSecondsRemaining, setQuestionSecondsRemaining] = useState<number>(DSA_MINUTES_PER_QUESTION * 60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeUpSubmittedRef = useRef(false);
  const proctorCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const didInitialScrollRef = useRef(false);

  const inTest = proctoringReady && !justPassed && !hasFailed && questions.length > 0;
  const isFullScreen = useFullScreenState(inTest);
  const { getMode: getFlagMode } = useFeatureFlags();
  const isFlagEnabled = (name: string) => getFlagMode(name) === "MONITOR" || getFlagMode(name) === "STRICT";
  const tabSwitchMode = getFlagMode("tab_switch_detection");
  const tabSwitchDetectionEnabled = isFlagEnabled("tab_switch_detection");
  const fullscreenRequired = isFlagEnabled("fullscreen_required");
  const effectivelyFullScreen = !fullscreenRequired || isFullScreen;
  const strikeTerminationMode = getFlagMode("proctoring_strike_termination") as StrikeTerminationMode;
  const MAX_TAB_SWITCHES = tabSwitchMode === "STRICT" ? 3 : 999;

  const terminateDsaForProctoring = useCallback(
    (_reason: ProctoringEventCode) => {
      if (questions.length > 0 && !submitting) {
        void (async () => {
          try {
            await api.post("/api/verification/dsa", { answers: {}, invalidated: true });
            await api.post("/api/verification/stages/update", { stageName: "dsa_round", status: "failed" });
          } catch {
            /* non-blocking */
          }
        })();
        setHasFailed(true);
        setLocalFinalScore(0);
      }
    },
    [questions.length, submitting]
  );

  useProctoringRiskMonitor({
    enabled: inTest,
    candidateId: user?.id,
    testId: testIdRef.current,
    testType: "dsa",
    cameraStream: proctoringState?.cameraStream ?? null,
    microphoneStream: proctoringState?.microphoneStream ?? null,
    tabSwitchDetectionEnabled,
    copyPasteDetectionEnabled: isFlagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: isFlagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: isFlagEnabled("fullscreen_required"),
    multipleFaceDetectionEnabled: isFlagEnabled("multiple_face_detection"),
    proctorVideoRef: proctorCameraVideoRef,
    microphoneMonitoringEnabled: isFlagEnabled("microphone_monitoring"),
    maxTabSwitches: MAX_TAB_SWITCHES,
    strikeTerminationMode,
    onProctoringTerminated: strikeTerminationMode === "STRICT" ? terminateDsaForProctoring : undefined,
    onMaxTabSwitches:
      strikeTerminationMode !== "STRICT" && tabSwitchMode === "STRICT"
        ? () => {
            if (questions.length > 0 && !submitting) {
              toast.error("Test terminated. Maximum 3 tab switches allowed.");
              void (async () => {
                try {
                  await api.post("/api/verification/dsa", { answers: {}, invalidated: true });
                  await api.post("/api/verification/stages/update", { stageName: "dsa_round", status: "failed" });
                } catch {
                  /* non-blocking */
                }
              })();
              setHasFailed(true);
              setLocalFinalScore(0);
            }
          }
        : undefined,
  });

  useSoundDetection({
    enabled: inTest && isFlagEnabled("microphone_monitoring"),
    threshold: 40,
    debounceMs: 4000,
    onSoundDetected: () => setSoundAlertOpen(true),
    existingAudioStream: proctoringState?.microphoneStream ?? undefined,
  });

  // Auto-clear the inline "sound detected" indicator so the UI doesn't get stuck.
  useEffect(() => {
    if (!soundAlertOpen) return;
    const t = window.setTimeout(() => setSoundAlertOpen(false), 8000);
    return () => window.clearTimeout(t);
  }, [soundAlertOpen]);

  useProctorFrameCapture({
    enabled: inTest && isFlagEnabled("screen_recording_enabled"),
    sessionId: testIdRef.current,
    testType: "dsa",
    cameraStream: proctoringState?.cameraStream ?? null,
  });

  useEffect(() => {
    const stream = proctoringState?.cameraStream ?? null;
    if (!proctorCameraVideoRef.current) return;
    proctorCameraVideoRef.current.srcObject = stream;
  }, [proctoringState?.cameraStream]);

  useEffect(() => {
    if (stageStatus !== "failed") setHasFailed(false);
  }, [stageStatus]);

  // When returning from the proctoring gate, the browser can preserve scroll position.
  // Force a top start so the question is visible immediately.
  useEffect(() => {
    if (!proctoringReady) return;
    if (didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    window.scrollTo(0, 0);
  }, [proctoringReady]);

  useEffect(() => {
    let cancelled = false;

    const loadQuestions = async () => {
      setQuestionsError(null);
      setHasEvaluatedQuestions(false);
      setResults(null);
      setConsoleText("");
      setOutputTab("results");
      setScores({});
      setCurrentIndex(0);
      setJustPassed(false);
      setHasFailed(false);
      setLocalFinalScore(null);

      const fetchQuestionsWithRecovery = async (): Promise<ApiDSAQuestion[]> => {
        try {
          return await api.get<ApiDSAQuestion[]>("/api/verification/dsa/questions");
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message : "";
          const looksInactiveDsa =
            status === 403 && /dsa round is not active/i.test(msg);
          if (!looksInactiveDsa) throw err;

          // Recovery path: activate stage and retry once.
          await api.post("/api/verification/stages/update", {
            stageName: "dsa_round",
            status: "in_progress",
          });
          return await api.get<ApiDSAQuestion[]>("/api/verification/dsa/questions");
        }
      };

      try {
        const q = await fetchQuestionsWithRecovery();
        if (cancelled) return;

        const questionsFromApi = Array.isArray(q) ? q : [];
        setQuestions(questionsFromApi);

        if (questionsFromApi.length > 0) {
          const initial: Record<string, Partial<Record<ProgrammingLanguage, string>>> = {};
          questionsFromApi.forEach((qu) => {
            initial[qu.id] = {};
            supportedLanguages.forEach(({ language: lang }) => {
              initial[qu.id]![lang] = getStarterForQuestion(qu, lang);
            });
          });
          // Restore locally autosaved buffers if they match this question set.
          const storageKey = user?.id ? `ph:dsaProgress:${user.id}` : null;
          let restored = false;
          if (storageKey) {
            try {
              const raw = localStorage.getItem(storageKey);
              if (raw) {
                const saved = JSON.parse(raw) as any;
                const savedIds: string[] = Array.isArray(saved?.questionIds) ? saved.questionIds : [];
                const idsNow = questionsFromApi.map((qq) => qq.id);
                const sameSet =
                  savedIds.length === idsNow.length && savedIds.every((id, idx) => id === idsNow[idx]);
                if (sameSet && saved?.codeByLang && typeof saved.codeByLang === "object") {
                  const merged: typeof initial = { ...initial };
                  for (const qid of idsNow) {
                    const perQ = (saved.codeByLang?.[qid] ?? null) as any;
                    if (!perQ || typeof perQ !== "object") continue;
                    merged[qid] = { ...(merged[qid] ?? {}) };
                    supportedLanguages.forEach(({ language: lang }) => {
                      const v = perQ?.[lang];
                      if (typeof v === "string") merged[qid]![lang] = v;
                    });
                  }
                  setCodeByLang(merged);
                  if (typeof saved?.language === "string") setLanguage(saved.language as ProgrammingLanguage);
                  if (typeof saved?.currentIndex === "number" && saved.currentIndex >= 0) setCurrentIndex(saved.currentIndex);
                  if (typeof saved?.secondsRemaining === "number" && saved.secondsRemaining >= 0) setSecondsRemaining(saved.secondsRemaining);
                  if (typeof saved?.questionSecondsRemaining === "number" && saved.questionSecondsRemaining >= 0) {
                    setQuestionSecondsRemaining(saved.questionSecondsRemaining);
                  }
                  restored = true;
                }
              }
            } catch {
              // ignore
            }
          }
          if (!restored) setCodeByLang(initial);
        } else {
          setCodeByLang({});
        }
        setOfficialByQuestion({});
        setCompileErrorPanel(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load DSA questions";
        if (!cancelled) setQuestionsError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setHasEvaluatedQuestions(true);
      }
    };

    void loadQuestions();

    return () => {
      cancelled = true;
    };
  }, [stageStatus, isRetry, questionsReloadKey]);

  // Autosave DSA editor buffers locally (recoverable on refresh/tab close).
  const dsaSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    if (!inTest) return;
    if (questions.length === 0) return;
    if (dsaSaveTimerRef.current != null) window.clearTimeout(dsaSaveTimerRef.current);
    dsaSaveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          `ph:dsaProgress:${user.id}`,
          JSON.stringify({
            questionIds: questions.map((q) => q.id),
            codeByLang,
            language,
            currentIndex,
            secondsRemaining,
            questionSecondsRemaining,
          })
        );
      } catch {
        // ignore
      }
    }, 800);
    return () => {
      if (dsaSaveTimerRef.current != null) window.clearTimeout(dsaSaveTimerRef.current);
    };
  }, [user?.id, inTest, questions, codeByLang, language, currentIndex, secondsRemaining, questionSecondsRemaining]);

  useEffect(() => {
    if (proctoringReady && questions.length > 0 && secondsRemaining === null) {
      setSecondsRemaining(DSA_TOTAL_MINUTES * 60);
    }
  }, [proctoringReady, questions.length, secondsRemaining]);

  useEffect(() => {
    if (!inTest || secondsRemaining == null || secondsRemaining <= 0) return;
    timerRef.current = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s == null || s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [inTest]);

  const selectedQuestion = questions[currentIndex];

  const trySetLanguage = useCallback(
    (newLang: ProgrammingLanguage) => {
      if (!selectedQuestion || newLang === language) return;
      const starter = getStarterForQuestion(selectedQuestion, language);
      const cur = codeByLang[selectedQuestion.id]?.[language] ?? "";
      if (cur.trim() !== starter.trim()) {
        setPendingLanguage(newLang);
        setLangSwitchOpen(true);
        return;
      }
      setLanguage(newLang);
    },
    [selectedQuestion, language, codeByLang]
  );

  const confirmLanguageSwitch = () => {
    if (pendingLanguage) setLanguage(pendingLanguage);
    setPendingLanguage(null);
    setLangSwitchOpen(false);
  };

  const runTests = async () => {
    if (!selectedQuestion) return;
    if (officialByQuestion[selectedQuestion.id]) {
      toast.info("This question is already submitted.");
      return;
    }
    const currentCode =
      codeByLang[selectedQuestion.id]?.[language] ?? getStarterForQuestion(selectedQuestion, language);
    if (!currentCode?.trim()) {
      toast.error("Write some code first");
      return;
    }
    setRunning(true);
    setResults(null);
    setCompileErrorPanel(null);
    setConsoleText("");
    setOutputTab("results");
    try {
      const resp = await api.post<{
        compiledSuccessfully?: boolean;
        compileError?: string;
        passed: number;
        total: number;
        results: Array<{
          passed: boolean;
          status?: TestResultStatus;
          input?: string;
          expected?: string;
          actual?: string;
        }>;
      }>("/api/verification/dsa/run-tests", {
        questionId: selectedQuestion.id,
        code: currentCode,
        language,
      });

      if (resp.compiledSuccessfully === false && resp.compileError) {
        setCompileErrorPanel(resp.compileError);
        setResults(null);
        setConsoleText(resp.compileError);
        setOutputTab("console");
        toast.error("Compilation failed — fix errors below.");
        return;
      }

      const total = resp.total ?? 0;
      const passedCount = resp.passed ?? 0;

      const testResults: TestResult[] = Array.isArray(resp.results)
        ? resp.results.map((r) => {
            const passed = !!r.passed;
            const inputRaw = typeof r.input === "string" ? r.input : undefined;
            const input =
              typeof inputRaw === "string"
                ? inputRaw.substring(0, 200) + (inputRaw.length > 200 ? "…" : "")
                : undefined;
            return {
              passed,
              status: r.status,
              input,
              expected: typeof r.expected === "string" ? r.expected : undefined,
              actual: typeof r.actual === "string" ? r.actual : undefined,
            };
          })
        : [];

      setResults(testResults);
      setConsoleText(
        testResults
          .map((r, i) => {
            const label = `Case ${i + 1}`;
            if (typeof r.actual === "string" && r.actual.trim().length > 0) {
              return `${label}:\n${r.actual}`;
            }
            // Hidden cases won't provide input/expected; show pass/fail only.
            return `${label}: ${r.passed ? "Passed" : "Failed"}`;
          })
          .join("\n\n")
      );
      setOutputTab("results");
      const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;
      setScores((prev) => ({ ...prev, [selectedQuestion.id]: score }));
      toast.success(`${passedCount}/${total} tests passed`);
    } catch (err: unknown) {
      const ax = err as Error & { status?: number; response?: { data?: { error?: string; retryAfter?: number } } };
      if (ax.status === 429) {
        const n = ax.response?.data?.retryAfter;
        toast.error(
          typeof n === "number"
            ? `You're running tests too frequently. Please wait ${n} seconds.`
            : "You're running tests too frequently. Please slow down."
        );
      } else {
        const msg = err instanceof Error ? err.message : "Execution failed";
        toast.error(msg);
        setResults([{ passed: false, status: "internal_error", actual: msg }]);
        setConsoleText(msg);
        setOutputTab("console");
      }
    } finally {
      setRunning(false);
    }
  };

  const handleOfficialSubmitQuestion = async () => {
    if (!selectedQuestion) return;
    if (officialByQuestion[selectedQuestion.id]) {
      toast.info("Already submitted.");
      return;
    }
    const currentCode =
      codeByLang[selectedQuestion.id]?.[language] ?? getStarterForQuestion(selectedQuestion, language);
    if (!currentCode?.trim()) {
      toast.error("Write some code first");
      return;
    }
    setSubmittingQuestion(true);
    setCompileErrorPanel(null);
    setConsoleText("");
    setOutputTab("results");
    try {
      const resp = await api.post<{
        compiledSuccessfully?: boolean;
        compileError?: string;
        passed: number;
        total: number;
        submitted?: boolean;
        results: Array<{ passed: boolean; status?: TestResultStatus; input?: string; expected?: string; actual?: string }>;
      }>("/api/verification/dsa/submit", {
        questionId: selectedQuestion.id,
        code: currentCode,
        language,
      });

      if (resp.compiledSuccessfully === false && resp.compileError) {
        setCompileErrorPanel(resp.compileError);
        setConsoleText(resp.compileError);
        setOutputTab("console");
        toast.error("Compilation failed — fix errors before submitting.");
        return;
      }

      const total = resp.total ?? 0;
      const passedCount = resp.passed ?? 0;
      const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;

      setOfficialByQuestion((prev) => ({
        ...prev,
        [selectedQuestion.id]: { code: currentCode, language, score },
      }));
      setScores((prev) => ({ ...prev, [selectedQuestion.id]: score }));

      const testResults: TestResult[] = Array.isArray(resp.results)
        ? resp.results.map((r) => ({
            passed: !!r.passed,
            status: r.status,
            input:
              typeof r.input === "string"
                ? r.input.substring(0, 200) + (r.input.length > 200 ? "…" : "")
                : undefined,
            expected: typeof r.expected === "string" ? r.expected : undefined,
            actual: typeof r.actual === "string" ? r.actual : undefined,
          }))
        : [];
      setResults(testResults);
      setConsoleText(
        testResults
          .map((r, i) => {
            const label = `Case ${i + 1}`;
            if (typeof r.actual === "string" && r.actual.trim().length > 0) {
              return `${label}:\n${r.actual}`;
            }
            return `${label}: ${r.passed ? "Passed" : "Failed"}`;
          })
          .join("\n\n")
      );
      setOutputTab("results");
      toast.success(`Submitted! Score for this question: ${score}/100`);
      setSubmitQuestionConfirmOpen(false);
    } catch (err: unknown) {
      const ax = err as Error & { status?: number; response?: { data?: { error?: string } } };
      if (ax.status === 409) {
        toast.error(ax.response?.data?.error ?? "You've already submitted this question.");
      } else {
        const msg = err instanceof Error ? err.message : "Submit failed";
        toast.error(msg);
      }
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const ELIGIBILITY_THRESHOLD = DSA_PASS_THRESHOLD;
  // Include local hasFailed so the failed UI shows immediately after a zero-score submission
  // without needing the parent to reload stage status from the server
  const isFailed = stageStatus === "failed" || hasFailed;
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

  const handleSubmitRound = useCallback(async () => {
    const missingOfficial = questions.filter((q) => !officialByQuestion[q.id]);
    if (missingOfficial.length > 0) {
      toast.error(
        `Submit each question officially first (${missingOfficial.length} remaining). Use "Submit solution" on every problem.`
      );
      setSubmitConfirmOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      const answers: Record<string, { code: string; language: string; score: number }> = {};
      questions.forEach((q) => {
        const snap = officialByQuestion[q.id]!;
        answers[q.id] = {
          code: snap.code,
          language: snap.language,
          score: snap.score,
        };
      });
      const dsaRes = await api.post<{ score: number | null }>("/api/verification/dsa", { answers });
      const finalScore = Math.min(100, Math.max(0, Math.round(Number(dsaRes.score ?? 0))));
      if (finalScore >= ELIGIBILITY_THRESHOLD) {
        await api.post("/api/verification/stages/update", {
          stageName: "dsa_round",
          status: "completed",
        });
        toast.success(`DSA round completed. Score: ${finalScore}/100.`);
        setJustPassed(true);
      } else {
        setLocalFinalScore(finalScore);
        setHasFailed(true);
        await api.post("/api/verification/stages/update", {
          stageName: "dsa_round",
          status: "failed",
        });
        toast.error(`Score ${finalScore}/100. Minimum ${ELIGIBILITY_THRESHOLD} required to proceed. Use "Retry This Step" to try again.`);
      }
    } catch (error: unknown) {
      const err = error as Error & { response?: { data?: { error?: string; code?: string } } };
      const msg = err.response?.data?.error ?? (error instanceof Error ? error.message : "Failed to submit DSA round.");
      toast.error(msg);
    } finally {
      setSubmitting(false);
      setSubmitConfirmOpen(false);
    }
  }, [questions, officialByQuestion]);

  useEffect(() => {
    if (secondsRemaining === 0 && inTest && questions.length > 0 && !submitting && !timeUpSubmittedRef.current) {
      timeUpSubmittedRef.current = true;
      toast.warning("Time's up! Submitting your round.");
      handleSubmitRound();
    }
  }, [secondsRemaining]);

  // Per-question 30-minute countdown — resets whenever the user switches questions
  useEffect(() => {
    setQuestionSecondsRemaining(DSA_MINUTES_PER_QUESTION * 60);
  }, [currentIndex]);

  useEffect(() => {
    if (!inTest) {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      return;
    }
    questionTimerRef.current = setInterval(() => {
      setQuestionSecondsRemaining((s) => {
        if (s <= 1) {
          if (questionTimerRef.current) clearInterval(questionTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [inTest, currentIndex]);

  if (!hasEvaluatedQuestions) {
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

  if (questionsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>DSA Round</CardTitle>
          <CardDescription>Could not load DSA questions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{questionsError}</p>
          <Button
            onClick={() => setQuestionsReloadKey((k) => k + 1)}
            variant="outline"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0) {
    const handleNoDsaComplete = async () => {
      setNoDsaSubmitting(true);
      try {
        await api.post("/api/verification/dsa", { answers: {} });
        await api.post("/api/verification/stages/update", {
          stageName: "dsa_round",
          status: "completed",
        });
        toast.success("DSA is not required for your role. You've automatically passed this step.");
        onComplete();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to complete DSA step.");
      } finally {
        setNoDsaSubmitting(false);
      }
    };
    return (
      <Card>
        <CardHeader>
          <CardTitle>DSA Round</CardTitle>
          <CardDescription>No DSA evaluation for your role</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              For your target role (e.g. Data Analyst, Business Analyst), DSA (Data Structures & Algorithms) is not evaluated.
              Your assessment focuses on SQL, data interpretation, and business case questions instead.
            </p>
            <Button onClick={handleNoDsaComplete} disabled={noDsaSubmitting}>
              {noDsaSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Continue to AI Expert Interview
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // When the stage is already failed (e.g. user returning after a previous attempt),
  // show the retry UI directly without requiring proctoring setup again.
  // Proctoring is only needed when the user is actually about to take the test.
  if (isFailed && !proctoringReady) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>DSA Round</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="text-sm text-muted-foreground">
              Your last score: {stageScore ?? 0}/100. Minimum {ELIGIBILITY_THRESHOLD} required to proceed.
            </p>
            {onRetry ? (
              <Button onClick={onRetry} className="mt-2">
                Retry Test
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Return to the dashboard and come back when you&apos;re ready to retry.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!proctoringReady) {
    return (
      <ProctoringSetupGate
        testName="DSA Round"
        enableScreenShare={false}
        isRetry={isRetry}
        skipSetup={!isFlagEnabled("camera_required") && !isFlagEnabled("screen_recording_enabled") && !isFlagEnabled("microphone_monitoring")}
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
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs sm:text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How this compiler is evaluated</p>
          <p>
            Write a complete solution that reads from <span className="font-mono">stdin</span> and prints only final answer
            to <span className="font-mono">stdout</span>. Hidden tests use the same format as examples. Extra debug logs can fail tests.
          </p>
        </div>

        {!effectivelyFullScreen && inTest && fullscreenRequired && (
          <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Enter full screen to proceed to the next question or submit.
            </span>
            <FullScreenMonitor active={inTest && fullscreenRequired} />
          </div>
        )}

        {/* Right proctoring panel (video + sound detection) */}
        <div className="fixed top-20 right-4 z-30 w-[260px] rounded-lg border border-border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20">
            <Shield className="h-4 w-4 text-primary" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">Proctoring</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {soundAlertOpen ? "Sound detected" : "Listening"}
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 shrink-0">
              LIVE
            </Badge>
          </div>

          <div className="p-3 space-y-3">
            <div className="rounded-md border bg-muted/30 overflow-hidden">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/20 border-b border-border">
                <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Camera</span>
              </div>
              <div className="relative aspect-video bg-muted">
                {proctoringState?.cameraStream ? (
                  <video
                    ref={proctorCameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    Camera unavailable
                  </div>
                )}
                <div className="absolute bottom-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white bg-black/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  LIVE
                </div>
              </div>
            </div>

            <div
              className={`rounded-md border p-2 flex items-start gap-2 ${
                soundAlertOpen ? "border-amber-500/30 bg-amber-500/10" : "bg-muted/20"
              }`}
            >
              <Volume2 className={`h-4 w-4 ${soundAlertOpen ? "text-amber-700" : "text-muted-foreground"}`} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">Sound detection</div>
                <div className="text-[10px] text-muted-foreground">
                  {soundAlertOpen ? "Unusual sound detected" : "Monitoring microphone"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Failed state — shown immediately after a low-score submission (no need to reload page) */}
        {isFailed && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="text-sm text-muted-foreground">
              Your score: {localFinalScore ?? stageScore ?? 0}/100. Minimum {ELIGIBILITY_THRESHOLD} required to proceed.
            </p>
            {onRetry && (
              <Button onClick={onRetry} className="mt-2">Retry Test</Button>
            )}
          </div>
        )}

        {/* Question progress + timers — only shown while in test and not failed */}
        {!isFailed && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-md border bg-muted/40">
              <span className="text-xs text-muted-foreground">AI Monitoring</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Proctoring rules information"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground hover:text-foreground"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px] p-3">
                  <p className="font-semibold mb-1">Proctoring signals tracked</p>
                  <p className="text-xs text-muted-foreground">
                    Voice detection, mobile phone detection, multiple/dual face detection, tab switching, and fullscreen exits.
                  </p>
                  <p className="text-xs mt-2">
                    Each violation adds risk points. If cumulative risk reaches <span className="font-semibold">400</span>, the attempt may be disqualified.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            {/* Per-question countdown */}
            {inTest && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-semibold border ${
                questionSecondsRemaining <= 300
                  ? "bg-red-500/10 border-red-500/40 text-red-500"
                  : questionSecondsRemaining <= 600
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-500"
                    : "bg-muted border-border text-muted-foreground"
              }`}>
                <span>Q{currentIndex + 1} time:</span>
                <span className="tabular-nums">{formatTime(questionSecondsRemaining)}</span>
              </div>
            )}
            {/* Global timer */}
            {secondsRemaining != null && inTest && (
              <span className={`text-sm font-mono font-medium ${secondsRemaining <= 300 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                Total: {formatTime(secondsRemaining)}
              </span>
            )}
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
        </div>
        )}

        {selectedQuestion && !isFailed && (
          <>
            {/* Question description */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2 flex-wrap">
                  {selectedQuestion.title}
                  <Badge variant="outline">{selectedQuestion.difficulty}</Badge>
                  {officialByQuestion[selectedQuestion.id] && (
                    <Badge className="gap-1 bg-green-600/15 text-green-800 border-green-600/30">
                      <Lock className="h-3 w-3" />
                      Submitted
                    </Badge>
                  )}
                </h3>
                <p className="mt-2 text-sm whitespace-pre-wrap">{selectedQuestion.description}</p>
              </div>
              {/* Example: one input and one output for clarity */}
              {selectedQuestion.examples.length > 0 && (
                <div className="space-y-4">
                  {selectedQuestion.examples.map((ex, exIdx) => (
                    <div key={exIdx} className="space-y-2">
                      <h4 className="text-sm font-medium text-foreground">
                        {selectedQuestion.examples.length > 1 ? `Example ${exIdx + 1}` : "Example"}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-md border border-border bg-background p-3">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Input</span>
                          <pre className="mt-1 text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words">
                            {ex.input}
                          </pre>
                        </div>
                        <div className="rounded-md border border-border bg-background p-3">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output</span>
                          <pre className="mt-1 text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words">
                            {ex.output}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Language selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Language:</span>
              <Select value={language} onValueChange={(v) => trySetLanguage(v as ProgrammingLanguage)}>
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
              value={
                codeByLang[selectedQuestion.id]?.[language] ?? getStarterForQuestion(selectedQuestion, language)
              }
              onChange={(v) => {
                if (officialByQuestion[selectedQuestion.id]) return;
                setCodeByLang((prev) => ({
                  ...prev,
                  [selectedQuestion.id]: {
                    ...(prev[selectedQuestion.id] ?? {}),
                    [language]: v,
                  },
                }));
              }}
              readOnly={!!officialByQuestion[selectedQuestion.id]}
              language={language}
              height="360px"
            />

            {/* Navigation + Run tests + Submit — all in one clear row */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t">
              <div className="flex flex-wrap gap-3">
                {/* Previous question — always visible, disabled on first question */}
                <Button
                  size="lg"
                  variant="outline"
                  className="font-medium"
                  onClick={() => {
                    setCurrentIndex((i) => Math.max(0, i - 1));
                    setResults(null);
                    setCompileErrorPanel(null);
                    setConsoleText("");
                    setOutputTab("results");
                  }}
                  disabled={isFirstQuestion || (inTest && !effectivelyFullScreen)}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>

                <Button
                  onClick={runTests}
                  disabled={
                    running ||
                    (inTest && !effectivelyFullScreen) ||
                    !!officialByQuestion[selectedQuestion.id]
                  }
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

                <Button
                  onClick={() => setSubmitQuestionConfirmOpen(true)}
                  disabled={
                    submittingQuestion ||
                    (inTest && !effectivelyFullScreen) ||
                    !!officialByQuestion[selectedQuestion.id]
                  }
                  variant="default"
                  size="lg"
                  className="font-medium bg-emerald-700 hover:bg-emerald-800"
                >
                  {submittingQuestion ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  Submit solution
                </Button>

                {!isLastQuestion && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="font-medium"
                    onClick={() => {
                      setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
                      setResults(null);
                      setCompileErrorPanel(null);
                      setConsoleText("");
                      setOutputTab("results");
                    }}
                    disabled={inTest && !effectivelyFullScreen}
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
                  disabled={submitting || (inTest && !effectivelyFullScreen)}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Submit entire round
                </Button>
              </div>
            </div>
            <AlertDialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogTitle>Submit entire round?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will submit your complete DSA round with all {questions.length} question(s). You must have used
                  &quot;Submit solution&quot; on each question first. After round submit you cannot change answers.
                  Continue?
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

            <AlertDialog open={langSwitchOpen} onOpenChange={setLangSwitchOpen}>
              <AlertDialogContent>
                <AlertDialogTitle>Switch language?</AlertDialogTitle>
                <AlertDialogDescription>
                  Switching to {pendingLanguage ? supportedLanguages.find((l) => l.language === pendingLanguage)?.displayName : "another language"}{" "}
                  loads that language&apos;s starter template for this question. Your current {language} code stays saved when you switch back.
                  Continue?
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={() => {
                      setPendingLanguage(null);
                    }}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <Button onClick={confirmLanguageSwitch}>Continue</Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={submitQuestionConfirmOpen} onOpenChange={setSubmitQuestionConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogTitle>Submit final answer for this question?</AlertDialogTitle>
                <AlertDialogDescription>
                  This records your official graded submission for this problem. You cannot re-submit or edit this
                  question afterward. Continue?
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={submittingQuestion}>Cancel</AlertDialogCancel>
                  <Button onClick={() => void handleOfficialSubmitQuestion()} disabled={submittingQuestion}>
                    {submittingQuestion ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Submitting…
                      </>
                    ) : (
                      "Yes, submit"
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-medium text-sm text-foreground">
                    Output for Q{currentIndex + 1}
                  </h4>
                  <div className="text-xs text-muted-foreground">
                    {compileErrorPanel ? "Compilation stopped execution" : results ? "Run completed" : null}
                  </div>
                </div>

                <Tabs
                  value={outputTab}
                  onValueChange={(v) => setOutputTab(v as "results" | "console")}
                >
                  <TabsList>
                    <TabsTrigger value="results">Results</TabsTrigger>
                    <TabsTrigger value="console">Console</TabsTrigger>
                  </TabsList>

                  <TabsContent value="results">
                    {compileErrorPanel ? (
                      <div className="rounded-xl border-2 border-orange-500/50 bg-orange-500/5 p-4 space-y-2">
                        <h4 className="font-medium text-sm text-orange-950">Compilation error</h4>
                        <pre className="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words text-orange-950">
                          {compileErrorPanel}
                        </pre>
                      </div>
                    ) : (
                      results && (
                        <div className="space-y-3">
                          {results.map((r, i) => {
                            const hidden = r.input == null && r.expected == null;
                            const st = r.status;
                            return (
                              <div
                                key={i}
                                className={`text-sm p-3 rounded-lg border ${
                                  r.passed
                                    ? "bg-green-500/10 border-green-600/20"
                                    : "bg-red-500/5 border-red-600/15"
                                }`}
                              >
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                  {r.passed ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-600" />
                                  )}
                                  <Badge variant="outline" className={statusBadgeClass(st, r.passed)}>
                                    {hidden
                                      ? `Test case ${i + 1}`
                                      : `Case ${i + 1}`}: {statusLabel(st) || (r.passed ? "Passed" : "Failed")}
                                  </Badge>
                                </div>
                                {hidden ? (
                                  <p className="text-xs text-muted-foreground">
                                    Hidden test — only status is shown (no input / expected).
                                  </p>
                                ) : !r.passed && r.input != null && r.expected != null ? (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                    <div className="rounded-md border bg-background p-2">
                                      <div className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        Input
                                      </div>
                                      <pre className="font-mono whitespace-pre-wrap break-words">{r.input}</pre>
                                    </div>
                                    <div className="rounded-md border bg-background p-2">
                                      <div className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        Expected
                                      </div>
                                      <pre className="font-mono whitespace-pre-wrap break-words">{r.expected}</pre>
                                    </div>
                                    <div className="rounded-md border bg-background p-2">
                                      <div className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                        Your output
                                      </div>
                                      <pre className="font-mono whitespace-pre-wrap break-words text-amber-800">
                                        {r.actual ?? "—"}
                                      </pre>
                                    </div>
                                  </div>
                                ) : r.passed ? (
                                  <p className="text-xs text-green-800">All checks passed for this case.</p>
                                ) : (
                                  <div className="space-y-1 text-xs">
                                    {r.actual != null && <div className="text-amber-800">Output: {r.actual}</div>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </TabsContent>

                  <TabsContent value="console">
                    <pre className="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words">
                      {consoleText || "No console output yet. Click “Run test cases” to execute your code."}
                    </pre>
                  </TabsContent>
                </Tabs>
              </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DSARoundStage;
