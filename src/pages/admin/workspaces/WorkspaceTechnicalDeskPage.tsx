import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type WorkflowJob = { id: string; userId: string; interviewId?: string | null; status: string; currentStep: string; attempts: number; maxAttempts: number; lastError?: string | null; updatedAt: string };
type Incident = { id: string; userId: string; module: string; issueCode: string; severity: string; status: string; summary: string; detail?: unknown; lastSeenAt: string };
type Candidate = { id: string; name?: string | null; email: string };
type Desk = { jobs: WorkflowJob[]; incidents: Incident[]; candidates: Candidate[]; generatedAt: string };

export default function WorkspaceTechnicalDeskPage() {
  const { id = "" } = useParams<{ id: string }>();
  const location = useLocation();
  const local = import.meta.env.DEV && location.pathname.startsWith("/local-preview/");
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (local) {
      setDesk({
        generatedAt: new Date().toISOString(),
        jobs: [
          { id: "preview-complete", userId: "preview-riya", interviewId: "preview-interview", status: "complete", currentStep: "complete", attempts: 1, maxAttempts: 8, updatedAt: new Date().toISOString() },
          { id: "preview-retry", userId: "preview-praveen", interviewId: "preview-interview-2", status: "retry", currentStep: "retry_scheduled", attempts: 2, maxAttempts: 8, lastError: "Report critic provider timed out; backend retry scheduled.", updatedAt: new Date().toISOString() },
        ],
        incidents: [
          { id: "preview-coverage", userId: "preview-praveen", module: "antigravity", issueCode: "coverage_incomplete", severity: "high", status: "open", summary: "The interview report exists, but its evidence coverage gate did not pass.", detail: { missingRequiredDimensions: ["application_transfer"], observedTurns: 9 }, lastSeenAt: new Date().toISOString() },
        ],
        candidates: [
          { id: "preview-riya", name: "Riya Menon", email: "riya.preview@provenhire.local" },
          { id: "preview-praveen", name: "Praveen Rao", email: "praveen.preview@provenhire.local" },
        ],
      });
      return;
    }
    if (!id) return;
    try {
      setError("");
      setDesk(await api.get<Desk>(`/api/workspaces/${id}/technical-desk`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the technical desk.");
    }
  }, [id, local]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const openIncidents = useMemo(() => desk?.incidents.filter((item) => item.status !== "resolved") ?? [], [desk]);
  const candidates = useMemo(
    () => new Map((desk?.candidates ?? []).map((candidate) => [candidate.id, candidate])),
    [desk],
  );
  const candidateLabel = (userId: string) => {
    const candidate = candidates.get(userId);
    return candidate ? `${candidate.name || candidate.email} · ${candidate.email}` : userId;
  };

  async function retry(jobId: string) {
    if (local) return;
    setBusy(jobId);
    try {
      await api.post(`/api/workspaces/${id}/technical-desk/jobs/${jobId}/retry`, {});
      await load();
    } finally {
      setBusy("");
    }
  }

  async function resolve(incidentId: string) {
    if (local) return;
    setBusy(incidentId);
    try {
      await api.post(`/api/workspaces/${id}/technical-desk/incidents/${incidentId}/resolve`, {});
      await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button asChild variant="outline" size="sm"><Link to={local ? "/local-preview/workspace" : `/admin/workspaces/${id}`}><ArrowLeft className="mr-2 h-4 w-4" />Workspace</Link></Button>
            <h1 className="mt-5 text-3xl font-bold tracking-tight">Assessment technical desk</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Backend-only workflow health for interview finalization, Postgres delivery, evidence coverage, telemetry reconciliation, and automatic DSA/unified report generation.</p>
          </div>
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>

        {error ? <Card className="border-rose-300"><CardContent className="p-4 text-rose-800">{error}</CardContent></Card> : null}
        {!desk ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading backend workflow state…</div> : (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              <Card><CardHeader><CardDescription>Open incidents</CardDescription><CardTitle className="text-3xl">{openIncidents.length}</CardTitle></CardHeader></Card>
              <Card><CardHeader><CardDescription>Running or queued</CardDescription><CardTitle className="text-3xl">{desk.jobs.filter((job) => ["pending", "retry", "running"].includes(job.status)).length}</CardTitle></CardHeader></Card>
              <Card><CardHeader><CardDescription>Completed pipelines</CardDescription><CardTitle className="text-3xl">{desk.jobs.filter((job) => job.status === "complete").length}</CardTitle></CardHeader></Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Issues requiring attention</h2>
              {!openIncidents.length ? <Card><CardContent className="flex items-center gap-3 p-5 text-sm"><CheckCircle2 className="h-5 w-5 text-emerald-600" />No unresolved assessment-pipeline incidents.</CardContent></Card> : openIncidents.map((incident) => (
                <Card key={incident.id} className={incident.severity === "critical" ? "border-rose-400" : "border-amber-300"}>
                  <CardHeader className="pb-3"><div className="flex flex-wrap items-center gap-2"><AlertTriangle className="h-5 w-5" /><Badge variant="outline">{incident.severity}</Badge><Badge variant="secondary">{incident.module}</Badge><code className="text-xs">{incident.issueCode}</code></div><CardTitle className="text-base">{incident.summary}</CardTitle><CardDescription>{candidateLabel(incident.userId)} · Last seen {new Date(incident.lastSeenAt).toLocaleString()}</CardDescription></CardHeader>
                  <CardContent className="space-y-3">{incident.detail ? <details className="rounded-md border bg-muted/40 p-3 text-xs"><summary className="cursor-pointer font-semibold">Technical diagnostics</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(incident.detail, null, 2)}</pre></details> : null}<Button size="sm" variant="outline" disabled={busy === incident.id} onClick={() => void resolve(incident.id)}>Mark reviewed</Button></CardContent>
                </Card>
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Automatic report workflows</h2>
              {desk.jobs.map((job) => (
                <Card key={job.id}><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge>{job.status}</Badge><span className="font-semibold">{job.currentStep.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-muted-foreground">{candidateLabel(job.userId)} · attempt {job.attempts}/{job.maxAttempts} · {new Date(job.updatedAt).toLocaleString()}</p>{job.interviewId ? <p className="mt-1 font-mono text-xs text-muted-foreground">Interview {job.interviewId}</p> : null}{job.lastError ? <p className="mt-2 max-w-4xl text-sm text-rose-700">{job.lastError}</p> : null}</div>{["blocked", "retry"].includes(job.status) ? <Button size="sm" variant="outline" disabled={busy === job.id} onClick={() => void retry(job.id)}><RotateCcw className="mr-2 h-4 w-4" />Retry pipeline</Button> : null}</CardContent></Card>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
