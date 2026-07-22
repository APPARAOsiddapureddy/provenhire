import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Loader2, PanelLeftClose, PanelLeftOpen, Play, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import CodeEditor from "@/components/CodeEditor";
import WorkspaceConfirmDialog from "@/components/WorkspaceConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RoundAttemptShell from "./RoundAttemptShell";

type SqlTask = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  sqlSchema: string;
  starterCode?: unknown;
  testCases: Array<{ input?: string; expected?: string; expectedType?: string }>;
};

type SqlResultRow = {
  passed: boolean;
  status: string;
  input?: string;
  expected?: string;
  actual?: string;
};

type SqlRunResult = {
  compiledSuccessfully: boolean;
  passed: number;
  total: number;
  submitted?: boolean;
  results: SqlResultRow[];
};

type SqlSnapshot = {
  session: {
    id: string;
    status: "active" | "submitted" | "auto_submitted" | "discarded";
    secondsRemaining: number;
    currentTaskId: string | null;
    score?: number | null;
    passedCount?: number | null;
    totalCount?: number | null;
    expired: boolean;
  };
  tasks: SqlTask[];
  drafts: Record<string, string>;
  officialSubmissions: Record<string, { query: string; passedCount: number; totalCount: number; score: number; submittedAt: string; results?: unknown }>;
  workspaceAttempt: {
    id: string;
    status: string;
    percentageScore?: number | null;
    weightedScore?: number | null;
    round: { name: string; order: number };
  };
};

function starterSql(task: SqlTask) {
  const starter = task.starterCode;
  if (starter && typeof starter === "object" && !Array.isArray(starter)) {
    const sql = (starter as Record<string, unknown>).sql;
    if (typeof sql === "string") return sql;
  }
  return "-- Write your SQL query below\nSELECT ";
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value.replace(/\n$/, "");
  return JSON.stringify(value);
}

function SqlConsolePanel({ result, message }: { result: SqlRunResult | null; message: string }) {
  if (!result) {
    return <div className="min-h-[120px] text-sm text-[var(--dash-text-muted)]">{message || "Run visible tests to see output."}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={result.passed === result.total ? "bg-emerald-500/20 text-emerald-100" : "bg-amber-500/20 text-amber-100"}>
          Passed {result.passed}/{result.total}
        </Badge>
        {result.submitted ? <Badge variant="outline" className="border-[var(--dash-gold)] text-[var(--dash-gold)]">Official</Badge> : null}
      </div>
      <div className="space-y-3">
        {result.results.map((test, index) => {
          const passed = Boolean(test.passed);
          return (
            <div key={index} className="rounded-lg border border-[var(--dash-navy-border)] bg-white/[0.02] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[var(--dash-text-primary)]">Test case {index + 1}</div>
                <Badge variant="outline" className={passed ? "border-emerald-400/40 text-emerald-100" : "border-red-400/40 text-red-100"}>
                  {passed ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                  {test.status}
                </Badge>
              </div>
              <div className="grid gap-2 lg:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs uppercase text-[var(--dash-text-muted)]">Seed data</div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-black/25 p-2 text-xs text-[var(--dash-text-primary)]">{displayValue(test.input)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-[var(--dash-text-muted)]">Expected</div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-black/25 p-2 text-xs text-[var(--dash-text-primary)]">{displayValue(test.expected)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase text-[var(--dash-text-muted)]">Actual</div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-black/25 p-2 text-xs text-[var(--dash-text-primary)]">{displayValue(test.actual)}</pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SqlRoundRunner({ workspaceCode, attemptId, sessionId }: { workspaceCode: string; attemptId: string; sessionId: string }) {
  const [snapshot, setSnapshot] = useState<SqlSnapshot | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [consoleMessage, setConsoleMessage] = useState("");
  const [runResult, setRunResult] = useState<SqlRunResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);
  const [submitConfirm, setSubmitConfirm] = useState<"task" | "final" | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<SqlSnapshot>("/api/session/sql/" + encodeURIComponent(sessionId));
    setSnapshot(res);
    setDrafts(res.drafts ?? {});
    const idx = res.session.currentTaskId ? res.tasks.findIndex((task) => task.id === res.session.currentTaskId) : 0;
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [sessionId]);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load SQL session"));
  }, [load]);

  const current = snapshot?.tasks[activeIndex] ?? null;
  const currentId = current?.id;
  const currentQuery = current ? drafts[current.id] ?? starterSql(current) : "";
  const isFinalized = snapshot?.workspaceAttempt.status === "completed" || snapshot?.workspaceAttempt.status === "auto_completed";
  const completedTasks = useMemo(() => Object.keys(snapshot?.officialSubmissions ?? {}).length, [snapshot?.officialSubmissions]);
  const roundComplete = !!snapshot && completedTasks >= snapshot.tasks.length;
  const currentOfficial = current ? snapshot?.officialSubmissions[current.id] : null;
  const isCurrentSubmitted = Boolean(currentOfficial);

  const setQuery = (query: string) => {
    if (!current) return;
    setDrafts((prev) => ({ ...prev, [current.id]: query }));
  };

  useEffect(() => {
    if (!currentId || isFinalized || isCurrentSubmitted) return;
    const timer = window.setTimeout(() => {
      api.patch("/api/session/sql/" + encodeURIComponent(sessionId), {
        currentTaskId: currentId,
        draft: { taskId: currentId, query: currentQuery },
      }).catch(() => {});
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [currentId, currentQuery, isFinalized, isCurrentSubmitted, sessionId]);

  const moveTo = async (index: number) => {
    if (!snapshot?.tasks[index]) return;
    setActiveIndex(index);
    setRunResult(null);
    setConsoleMessage("");
    if (!isFinalized) {
      await api.patch("/api/session/sql/" + encodeURIComponent(sessionId), { currentTaskId: snapshot.tasks[index].id }).catch(() => {});
    }
  };

  const runTests = async () => {
    if (!current) return;
    setBusy("run");
    try {
      const res = await api.post<SqlRunResult>("/api/session/sql/" + encodeURIComponent(sessionId) + "/run-tests", {
        taskId: current.id,
        query: currentQuery,
      });
      setRunResult(res);
      setConsoleMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not run SQL tests");
    } finally {
      setBusy(null);
    }
  };

  const submitTask = async () => {
    if (!current) return;
    setBusy("task");
    try {
      const res = await api.post<SqlRunResult>("/api/session/sql/" + encodeURIComponent(sessionId) + "/questions/" + encodeURIComponent(current.id) + "/submit", {
        query: currentQuery,
      });
      setRunResult(res);
      setConsoleMessage("Official submission passed " + res.passed + "/" + res.total + ".");
      setSubmitConfirm(null);
      toast.success("SQL task submitted.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit SQL task");
    } finally {
      setBusy(null);
    }
  };

  const finalSubmit = async () => {
    setBusy("final");
    try {
      const res = await api.post<SqlSnapshot>("/api/session/sql/" + encodeURIComponent(sessionId) + "/submit", {});
      setSnapshot(res);
      setDrafts(res.drafts ?? {});
      setSubmitConfirm(null);
      toast.success("SQL round submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit SQL round");
    } finally {
      setBusy(null);
    }
  };

  if (!snapshot || !current) {
    return (
      <RoundAttemptShell workspaceCode={workspaceCode} attemptId={attemptId} sessionId={sessionId} testType="sql" title="SQL Round" subtitle="Loading session" secondsRemaining={null}>
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
      testType="sql"
      title={snapshot.workspaceAttempt.round.name}
      subtitle={"Task " + (activeIndex + 1) + " of " + snapshot.tasks.length}
      secondsRemaining={snapshot.session.secondsRemaining}
      isFinalized={isFinalized}
      onExpired={() => {
        toast.info("SQL time expired. Finalizing saved work.");
        void load();
      }}
    >
      {isFinalized ? (
        <Card className="border-emerald-400/30 bg-emerald-400/10">
          <CardContent className="p-5 text-emerald-100">
            Submitted. Score: {snapshot.workspaceAttempt.percentageScore ?? 0}% - Weighted: {snapshot.workspaceAttempt.weightedScore ?? 0}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--dash-navy-border)] bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[var(--dash-text-muted)]">
            Completed <span className="font-medium text-[var(--dash-text-primary)]">{completedTasks}/{snapshot.tasks.length}</span>
          </div>
          <Button onClick={() => setSubmitConfirm("final")} disabled={busy === "final" || !roundComplete}>
            {busy === "final" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit SQL Round
          </Button>
        </div>
      )}

      <div className={"grid grid-cols-1 gap-4 " + (tasksOpen ? "xl:grid-cols-[340px_1fr]" : "xl:grid-cols-1")}>
        {tasksOpen ? (
          <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base text-[var(--dash-text-primary)]">SQL tasks</CardTitle>
                <Button type="button" variant="ghost" size="icon" onClick={() => setTasksOpen(false)} aria-label="Hide SQL tasks panel">
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-[var(--dash-navy-border)] bg-black/20 px-3 py-2 text-sm text-[var(--dash-text-muted)]">
                Completed {completedTasks}/{snapshot.tasks.length}
              </div>
              <div className="space-y-2">
                {snapshot.tasks.map((task, index) => {
                  const official = snapshot.officialSubmissions[task.id];
                  const active = index === activeIndex;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => moveTo(index)}
                      className={"w-full rounded-lg border px-3 py-2 text-left transition " + (active ? "border-[var(--dash-gold)] bg-[var(--dash-gold)]/10" : "border-[var(--dash-navy-border)] bg-white/[0.02] hover:bg-white/[0.05]")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-[var(--dash-text-primary)]">{task.title}</span>
                        {official ? <Badge variant="outline">{official.score}/100</Badge> : null}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--dash-text-muted)]">
                        <Database className="h-3 w-3" />
                        {task.difficulty}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          {!tasksOpen ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setTasksOpen(true)}>
              <PanelLeftOpen className="mr-2 h-4 w-4" />
              Show tasks
            </Button>
          ) : null}

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(320px,0.85fr)_minmax(520px,1.15fr)]">
            <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-[var(--dash-text-primary)]">{current.title}</CardTitle>
                <div className="text-xs text-[var(--dash-text-muted)]">{current.difficulty}</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="whitespace-pre-wrap text-sm leading-6 text-[var(--dash-text-primary)]">{current.description}</div>
                <div>
                  <div className="mb-2 text-xs uppercase text-[var(--dash-text-muted)]">Database schema</div>
                  <pre className="max-h-[360px] overflow-auto rounded-lg border border-[var(--dash-navy-border)] bg-black/30 p-3 text-xs text-[var(--dash-text-primary)]">{current.sqlSchema || "Schema details are included in the test setup."}</pre>
                </div>
                {current.testCases.length ? (
                  <div>
                    <div className="mb-2 text-xs uppercase text-[var(--dash-text-muted)]">Visible expectations</div>
                    <div className="space-y-2">
                      {current.testCases.map((tc, index) => (
                        <div key={index} className="rounded-md border border-[var(--dash-navy-border)] bg-black/20 p-3 text-xs text-[var(--dash-text-muted)]">
                          <div className="font-medium text-[var(--dash-text-primary)]">Case {index + 1}</div>
                          <pre className="mt-2 whitespace-pre-wrap">Expected: {displayValue(tc.expected)}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <CardTitle className="text-base text-[var(--dash-text-primary)]">Query editor</CardTitle>
                    {currentOfficial ? <Badge variant="outline" className="border-emerald-400/40 text-emerald-100">Submitted {currentOfficial.score}/100</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CodeEditor value={currentQuery} onChange={setQuery} language="sql" readOnly={isFinalized || Boolean(currentOfficial)} height="420px" />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={runTests} disabled={Boolean(busy) || isFinalized || Boolean(currentOfficial)}>
                      {busy === "run" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      Run Visible Tests
                    </Button>
                    <Button onClick={() => setSubmitConfirm("task")} disabled={Boolean(busy) || isFinalized || Boolean(currentOfficial)}>
                      {busy === "task" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Submit Task
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[var(--dash-navy-border)] bg-black/30">
                <CardHeader>
                  <CardTitle className="text-base text-[var(--dash-text-primary)]">Console</CardTitle>
                </CardHeader>
                <CardContent>
                  <SqlConsolePanel result={runResult} message={consoleMessage} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <WorkspaceConfirmDialog
        open={Boolean(submitConfirm)}
        title={submitConfirm === "task" ? "Submit this SQL query?" : "Submit the full SQL round?"}
        description={
          submitConfirm === "task"
            ? "You cannot resubmit this task after submission. Hidden tests will be included in the score."
            : "You cannot edit completed SQL tasks after submitting the round."
        }
        confirmLabel="Yes, Submit"
        cancelLabel="No"
        loading={busy === "task" || busy === "final"}
        onOpenChange={(open) => {
          if (!open) setSubmitConfirm(null);
        }}
        onConfirm={() => {
          if (submitConfirm === "task") {
            void submitTask();
          } else if (submitConfirm === "final") {
            void finalSubmit();
          }
        }}
      />
    </RoundAttemptShell>
  );
}
