import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BrainCircuit, CheckCircle2, Code2, ExternalLink, RadioTower, ShieldAlert, Target } from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageLoaderFullScreen } from "@/components/PageLoader";
import type { WorkspaceCandidateDossier } from "./types";
import { preview, workspaceId as localWorkspaceId } from "./WorkspaceLocalPreviewPage";

type ModuleKey = "overview" | "aptitude" | "dsa" | "antigravity";
type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const asList = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => asList(value).map(String).filter(Boolean);
const numeric = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const titleize = (value: string) => value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function scoreColor(score: number) {
  if (score >= 85) return "text-emerald-700";
  if (score >= 70) return "text-amber-700";
  return "text-rose-700";
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>;
}

function EvidenceList({ title, items, empty = "No evidence recorded." }: { title: string; items: string[]; empty?: string }) {
  return <Card><CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{items.length ? <ul className="space-y-3 text-sm">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2 leading-6"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600"/><span>{item}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}</CardContent></Card>;
}

function ScoreBreakdown({ values, scale = 100 }: { values: Json; scale?: number }) {
  const entries = Object.entries(values).filter(([, value]) => Number.isFinite(Number(value)));
  if (!entries.length) return <p className="text-sm text-muted-foreground">No structured score breakdown was persisted.</p>;
  return <div className="space-y-4">{entries.map(([key, raw]) => { const value = numeric(raw); const percent = Math.min(100, scale === 10 ? value * 10 : value); return <div key={key}><div className="mb-1.5 flex justify-between text-sm"><span>{titleize(key)}</span><span className="font-semibold">{value}/{scale}</span></div><Progress value={percent}/></div>; })}</div>;
}

function Overview({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const synthesis = dossier.synthesis;
  if (!synthesis) return <Card><CardContent className="p-6 text-sm text-muted-foreground">The backend did not emit a cross-module synthesis for this legacy dossier. Refresh after the updated service is running.</CardContent></Card>;
  return <div className="space-y-5">
    <Card className="border-primary/20 bg-primary/[0.03]"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardDescription>Evidence-weighted hiring synthesis</CardDescription><CardTitle className="mt-2 text-2xl">{synthesis.recommendation}</CardTitle></div><div className="text-right"><p className={`text-5xl font-bold ${scoreColor(synthesis.compositeScore ?? 0)}`}>{synthesis.compositeScore ?? "—"}</p><p className="text-xs text-muted-foreground">composite / 100 · {Math.round(synthesis.confidence * 100)}% confidence</p></div></div></CardHeader><CardContent><p className="max-w-5xl text-sm leading-7">{synthesis.overallRead}</p><div className="mt-4 rounded-lg border bg-background/70 p-3 text-xs text-muted-foreground">This is a deterministic evidence synthesis, not an extra opaque LLM score. It compares normalized module scores, score spread, Antigravity verdict, verified strengths, and scoped risks.</div></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3"><Metric label="Aptitude" value={synthesis.evidenceBasis.aptitudeScore ?? "—"} detail="Comprehension and structured problem solving"/><Metric label="DSA" value={synthesis.evidenceBasis.dsaScore ?? "—"} detail="Objective coding and test performance"/><Metric label="Antigravity" value={synthesis.evidenceBasis.antigravityScore ?? "—"} detail={synthesis.evidenceBasis.antigravityVerdict || "Interview reasoning evidence"}/></div>
    <div className="grid gap-4 lg:grid-cols-2"><EvidenceList title="Signals that reinforce one another" items={synthesis.crossModuleSignals}/><EvidenceList title="Contradictions and uncertainty" items={synthesis.contradictions}/><EvidenceList title="Verified strengths" items={synthesis.verifiedStrengths}/><EvidenceList title="Scoped risks" items={synthesis.scopedRisks}/></div>
    <EvidenceList title="Recommended panel actions" items={synthesis.nextActions} empty="No additional panel action was generated."/>
  </div>;
}

function AptitudeReport({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const latest = dossier.modules.aptitude.latest;
  if (!latest) return <MissingModule name="Aptitude"/>;
  const answers = asRecord(latest.answers);
  const categories = asList(answers.categories).map(asRecord);
  return <div className="space-y-5">
    <Card><CardHeader><CardDescription>Individual module report</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><BrainCircuit className="h-6 w-6 text-primary"/>Aptitude reasoning report</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Score" value={`${latest.score ?? "—"}/100`} detail="Persisted assessment score"/><Metric label="Correct" value={String(answers.correct ?? "—")} detail={`of ${answers.totalQuestions ?? "recorded questions"}`}/><Metric label="Incorrect" value={String(answers.incorrect ?? "—")} detail="Responses that need review"/><Metric label="Skipped" value={String(answers.skipped ?? "—")} detail="Unattempted questions"/></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Reasoning-domain breakdown</CardTitle><CardDescription>Where the candidate's objective aptitude signal is strongest or weakest.</CardDescription></CardHeader><CardContent>{categories.length ? <div className="space-y-4">{categories.map((category, index) => <div key={index}><div className="mb-1.5 flex justify-between text-sm"><span>{String(category.name || `Category ${index + 1}`)}</span><span className="font-semibold">{numeric(category.score)}/100</span></div><Progress value={numeric(category.score)}/></div>)}</div> : <p className="text-sm text-muted-foreground">Legacy attempt: category-level evidence was not persisted.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Attempt record</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Completed {new Date(latest.completedAt).toLocaleString()} · Raw earned marks {String(answers.earnedMarks ?? latest.score ?? "—")} of {String(answers.totalMarks ?? 100)}.</CardContent></Card>
  </div>;
}

function DsaReport({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const latest = dossier.modules.dsa.latest;
  if (!latest) return <MissingModule name="DSA"/>;
  const answers = asRecord(latest.answers);
  const problems = asList(answers.problems).map(asRecord);
  return <div className="space-y-5">
    <Card><CardHeader><CardDescription>Individual module report</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><Code2 className="h-6 w-6 text-primary"/>DSA implementation report</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Score" value={`${latest.score ?? "—"}/100`} detail="Persisted coding score"/><Metric label="Problems passed" value={`${answers.passedProblems ?? "—"}/${answers.totalProblems ?? "—"}`} detail="Completed problem outcomes"/><Metric label="Test cases" value={`${answers.testCasesPassed ?? "—"}/${answers.testCasesTotal ?? "—"}`} detail="Objective correctness evidence"/><Metric label="Language" value={String(answers.language ?? "Not recorded")} detail="Submission language"/></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Problem-by-problem evidence</CardTitle></CardHeader><CardContent className="space-y-3">{problems.length ? problems.map((problem, index) => <div key={index} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-medium">{String(problem.title || `Problem ${index + 1}`)}</p><p className="text-xs text-muted-foreground">Time complexity {String(problem.timeComplexity || "not recorded")}</p></div><Badge variant="outline">{String(problem.status || "recorded")}</Badge><span className="font-semibold">{String(problem.score ?? "—")} pts</span></div>) : <p className="text-sm text-muted-foreground">Legacy attempt: per-problem evidence was not persisted.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Complexity and implementation read</CardTitle></CardHeader><CardContent><p className="text-sm leading-7">{String(answers.complexityAssessment || "No structured complexity assessment was persisted for this attempt.")}</p></CardContent></Card>
  </div>;
}

function AntigravityReport({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const latest = dossier.modules.antigravity.latest;
  if (!latest) return <MissingModule name="Antigravity"/>;
  const report = asRecord(latest.report);
  const coverage = asRecord(report.coverage_portrait);
  const domain = asRecord(coverage.primary_domain);
  const baseUrl = String(import.meta.env.VITE_ANTIGRAVITY_PUBLIC_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const nativeReportAvailable = !latest.antigravitySessionId.startsWith("local_");
  return <div className="space-y-5">
    <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardDescription>Individual module report · {latest.schemaVersion}</CardDescription><CardTitle className="mt-2 flex items-center gap-2 text-2xl"><RadioTower className="h-6 w-6 text-primary"/>Antigravity evidence report</CardTitle></div>{nativeReportAvailable ? <Button asChild variant="outline"><a href={`${baseUrl}/report/${encodeURIComponent(latest.antigravitySessionId)}`} target="_blank" rel="noreferrer">Open native report <ExternalLink className="ml-2 h-4 w-4"/></a></Button> : <Badge variant="outline">Embedded local report</Badge>}</div></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Score" value={`${latest.overallScore ?? "—"}/10`} detail="Evidence-weighted interview score"/><Metric label="Verdict" value={latest.hireRecommendation || "—"} detail="Final evaluator recommendation"/><Metric label="Confidence" value={latest.confidenceScore == null ? "—" : `${Math.round(latest.confidenceScore * 100)}%`} detail="Evaluator confidence"/><Metric label="Telemetry" value={latest._count.telemetryEvents} detail="Persisted interaction facts"/></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Recruiter reasoning</CardTitle></CardHeader><CardContent><p className="text-sm leading-7">{String(report.recruiter_summary || report.summary || "No recruiter narrative was emitted.")}</p></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2"><EvidenceList title="Verified strengths" items={strings(report.tested_strengths).length ? strings(report.tested_strengths) : strings(report.strengths)}/><EvidenceList title="Scoped risks" items={strings(report.tested_risks).length ? strings(report.tested_risks) : strings(report.risk_flags)}/></div>
    <Card><CardHeader><CardTitle className="text-base">Dimension scores</CardTitle></CardHeader><CardContent><ScoreBreakdown values={asRecord(report.scores)} scale={10}/></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2"><EvidenceList title="Voluntary coverage" items={strings(domain.voluntary_coverage)}/><EvidenceList title="Missed or unresolved coverage" items={[...strings(domain.missed_coverage), ...strings(domain.incorrect_coverage)]}/><EvidenceList title="Claim calibration" items={asList(report.claim_findings).map((item) => { const row = asRecord(item); return `${String(row.claim || "Claim")}: ${String(row.status || "untested")} — ${String(row.interpretation || "No interpretation")}`; })}/><EvidenceList title="Recommended follow-ups" items={strings(report.recommended_followups)}/></div>
    <Card><CardHeader><CardTitle className="text-base">Evidence provenance</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-muted-foreground">Session</p><p className="mt-1 break-all font-mono text-xs">{latest.antigravitySessionId}</p></div><div><p className="text-muted-foreground">Transcript turns</p><p className="mt-1 font-semibold">{Array.isArray(latest.transcript) ? latest.transcript.length : 0}</p></div><div><p className="text-muted-foreground">Received</p><p className="mt-1 font-semibold">{new Date(latest.receivedAt).toLocaleString()}</p></div></CardContent></Card>
  </div>;
}

function MissingModule({ name }: { name: string }) { return <Card><CardContent className="flex items-start gap-3 p-6"><ShieldAlert className="h-5 w-5 text-amber-600"/><div><p className="font-semibold">{name} report unavailable</p><p className="mt-1 text-sm text-muted-foreground">This candidate has no persisted completed result for this module.</p></div></CardContent></Card>; }

export default function WorkspaceCandidateReportsPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("module") as ModuleKey | null;
  const module: ModuleKey = ["overview", "aptitude", "dsa", "antigravity"].includes(requested || "") ? requested! : "overview";
  const [dossier, setDossier] = useState<WorkspaceCandidateDossier | null>(null);
  const [error, setError] = useState("");
  const local = import.meta.env.DEV && (!id || id === localWorkspaceId);

  useEffect(() => {
    if (!userId) return;
    if (local) { setDossier(preview.dossiers[userId] ?? null); setError(preview.dossiers[userId] ? "" : "Local preview candidate not found."); return; }
    if (!id) return;
    api.get<{ dossier: WorkspaceCandidateDossier }>(`/api/workspaces/${id}/registrations/${userId}/dossier`).then((response) => setDossier(response.dossier)).catch((reason) => setError(reason instanceof Error ? reason.message : "Failed to load candidate reports"));
  }, [id, userId, local]);

  const candidateName = useMemo(() => dossier?.candidate.jobSeekerProfile?.fullName || dossier?.candidate.name || "Candidate", [dossier]);
  if (!dossier && !error) return <PageLoaderFullScreen/>;
  if (!dossier) return <main className="min-h-screen bg-muted/30 p-8"><Card className="mx-auto max-w-xl"><CardContent className="p-6 text-rose-700">{error}</CardContent></Card></main>;
  const backHref = local ? "/local-preview/workspace" : `/admin/workspaces/${id}`;
  const baseHref = local ? `/local-preview/workspace/candidates/${userId}/reports` : `/admin/workspaces/${id}/candidates/${userId}/reports`;
  const modules: Array<{ key: ModuleKey; label: string; icon: typeof Target }> = [{ key: "overview", label: "Unified reasoning", icon: Target }, { key: "aptitude", label: "Aptitude report", icon: BrainCircuit }, { key: "dsa", label: "DSA report", icon: Code2 }, { key: "antigravity", label: "Antigravity report", icon: RadioTower }];

  return <main className="min-h-screen bg-muted/30 px-4 py-6 md:px-8"><div className="mx-auto max-w-7xl space-y-5">
    {local ? <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Local preview mode: this uses production-shaped dossier data without authentication or database writes.</div> : null}
    <header className="rounded-xl border bg-background p-5 shadow-sm md:p-7"><Button asChild variant="ghost" size="sm" className="mb-4 -ml-3"><Link to={backHref}><ArrowLeft className="mr-2 h-4 w-4"/>Back to workspace</Link></Button><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Candidate assessment dossier</p><h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{candidateName}</h1><p className="mt-2 text-muted-foreground">{dossier.candidate.email} · {dossier.candidate.jobSeekerProfile?.targetJobTitle || "Target role not recorded"}</p></div><Badge variant="outline" className="px-3 py-1.5">{dossier.synthesis?.completedModules ?? 0}/3 modules complete</Badge></div></header>
    <nav className="grid gap-2 rounded-xl border bg-background p-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Candidate report modules">{modules.map(({ key, label, icon: Icon }) => <Button key={key} asChild variant={module === key ? "default" : "ghost"} className="justify-start"><Link to={`${baseHref}?module=${key}`}><Icon className="mr-2 h-4 w-4"/>{label}</Link></Button>)}</nav>
    {module === "overview" ? <Overview dossier={dossier}/> : module === "aptitude" ? <AptitudeReport dossier={dossier}/> : module === "dsa" ? <DsaReport dossier={dossier}/> : <AntigravityReport dossier={dossier}/>} 
  </div></main>;
}
