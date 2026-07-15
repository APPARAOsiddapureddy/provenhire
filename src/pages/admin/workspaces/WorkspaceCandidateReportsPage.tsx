import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BrainCircuit, CheckCircle2, Clock3, Code2, ExternalLink, FileSearch, RadioTower, ShieldAlert, Target, XCircle } from "lucide-react";

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
    <Card><CardHeader><CardTitle className="text-base">Decision audit</CardTitle><CardDescription>How the dossier reaches the recommendation without hiding the evidence chain.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-3">{[["Objective baseline", "Aptitude establishes comprehension and structured reasoning under a fixed test."], ["Implementation proof", "DSA checks whether that reasoning survives executable code and test cases."], ["Pressure-tested transfer", "Antigravity probes ownership, mechanisms, failure boundaries, and production judgment."]].map(([label, detail], index) => <div key={label} className="rounded-xl border p-4"><Badge variant="outline">Layer {index + 1}</Badge><p className="mt-3 font-semibold">{label}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></div>)}</div><div className="rounded-xl bg-muted/50 p-4 text-sm leading-7"><strong>Calibration:</strong> the module spread is {synthesis.evidenceBasis.scoreSpread} points. {synthesis.evidenceBasis.scoreSpread <= 10 ? "The modules substantially agree, so confidence is strengthened by independent evidence." : "The spread is material, so the panel should resolve the contradictions before treating the composite as a hiring truth."}</div></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2"><EvidenceList title="Signals that reinforce one another" items={synthesis.crossModuleSignals}/><EvidenceList title="Contradictions and uncertainty" items={synthesis.contradictions}/><EvidenceList title="Verified strengths" items={synthesis.verifiedStrengths}/><EvidenceList title="Scoped risks" items={synthesis.scopedRisks}/></div>
    <EvidenceList title="Recommended panel actions" items={synthesis.nextActions} empty="No additional panel action was generated."/>
  </div>;
}

function AptitudeReport({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const persistedLatest = dossier.modules.aptitude.latest;
  const workspaceEvidence = dossier.modules.aptitude.workspaceEvidence;
  if (!persistedLatest && !workspaceEvidence) return <MissingModule name="Aptitude"/>;
  const latest = persistedLatest ?? {
    id: workspaceEvidence!.sessionId,
    score: workspaceEvidence!.score,
    completedAt: workspaceEvidence!.completedAt || new Date().toISOString(),
    answers: workspaceEvidence,
  };
  const answers = workspaceEvidence ? asRecord(workspaceEvidence) : asRecord(latest.answers);
  const categories = asList(answers.categories).map(asRecord);
  const review = asList(answers.questionReview).map(asRecord);
  const total = numeric(answers.questions ?? answers.totalQuestions, review.length);
  const correct = numeric(answers.correct);
  const attempted = Math.max(0, total - numeric(answers.skipped));
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
  const timeTaken = numeric(answers.timeTakenSeconds);
  const timeLimit = numeric(answers.timeLimitSeconds);
  const issues = review.filter((row) => String(row.outcome) !== "correct");
  return <div className="space-y-5">
    <Card><CardHeader><CardDescription>Full evidence report · objective reasoning round</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><BrainCircuit className="h-6 w-6 text-primary"/>Aptitude reasoning report</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Score" value={`${latest.score ?? "—"}/100`} detail="Persisted assessment score"/><Metric label="Accuracy" value={`${accuracy}%`} detail={`${correct} correct across ${attempted} attempted`}/><Metric label="Incorrect" value={String(answers.incorrect ?? "—")} detail="Responses that need review"/><Metric label="Skipped" value={String(answers.skipped ?? "—")} detail="Unattempted questions"/></div><div className="rounded-xl border-l-4 border-l-primary bg-muted/40 p-4"><p className="font-semibold">Reasoning interpretation</p><p className="mt-2 text-sm leading-7">{accuracy >= 90 ? "The attempt shows high objective precision with a very small error surface. The report still separates wrong and skipped items so the panel can distinguish a knowledge gap from time allocation." : accuracy >= 75 ? "The baseline is positive, but the error ledger should be reviewed for repeated domain or time-pressure patterns." : "The objective signal is mixed. Treat the aggregate score as a starting point and inspect the question-level evidence before making a decision."}</p></div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Reasoning-domain breakdown</CardTitle><CardDescription>Where the candidate's objective aptitude signal is strongest or weakest.</CardDescription></CardHeader><CardContent>{categories.length ? <div className="space-y-4">{categories.map((category, index) => <div key={index}><div className="mb-1.5 flex justify-between text-sm"><span>{String(category.name || `Category ${index + 1}`)}</span><span className="font-semibold">{numeric(category.score)}/100</span></div><Progress value={numeric(category.score)}/></div>)}</div> : <p className="text-sm text-muted-foreground">Legacy attempt: category-level evidence was not persisted.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><XCircle className="h-4 w-4 text-rose-600"/>Error and omission review</CardTitle><CardDescription>Every persisted incorrect or skipped response, including the expected answer.</CardDescription></CardHeader><CardContent className="space-y-3">{issues.length ? issues.map((row, index) => <div key={String(row.id ?? index)} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{String(row.question || `Question ${index + 1}`)}</p><Badge variant={String(row.outcome) === "skipped" ? "outline" : "destructive"}>{String(row.outcome)}</Badge></div><div className="mt-3 grid gap-3 text-sm md:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Candidate answer</p><p className="mt-1">{String(row.selectedAnswer || "No answer submitted")}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correct answer</p><p className="mt-1 font-medium text-emerald-700">{String(row.correctAnswer || "Not retained")}</p></div></div></div>) : <p className="text-sm text-muted-foreground">No question-level errors were persisted for this attempt.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSearch className="h-4 w-4"/>Complete question ledger</CardTitle><CardDescription>Open any item to audit the prompt, options, submitted answer, expected answer, and awarded marks.</CardDescription></CardHeader><CardContent className="space-y-2">{review.length ? review.map((row, index) => <details key={String(row.id ?? index)} className="rounded-lg border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Question {index + 1} · {titleize(String(row.outcome || "recorded"))} · {numeric(row.marks, 1)} mark(s)</summary><div className="mt-4 space-y-3 text-sm"><p className="font-medium leading-6">{String(row.question)}</p>{asList(row.options).length ? <ol className="list-inside list-[upper-alpha] space-y-1 text-muted-foreground">{asList(row.options).map((option, optionIndex) => <li key={optionIndex}>{String(option)}</li>)}</ol> : null}<p><strong>Submitted:</strong> {String(row.selectedAnswer || "Skipped")}</p><p><strong>Expected:</strong> {String(row.correctAnswer || "Not retained")}</p></div></details>) : <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">This historical attempt predates question-level persistence. New submissions now retain the review ledger; this report will not fabricate missing prompts or answers.</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4"/>Attempt and timing record</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm md:grid-cols-3"><div><p className="text-muted-foreground">Completed</p><p className="mt-1 font-semibold">{new Date(latest.completedAt).toLocaleString()}</p></div><div><p className="text-muted-foreground">Raw earned marks</p><p className="mt-1 font-semibold">{String(answers.earnedMarks ?? latest.score ?? "—")} of {String(answers.totalMarks ?? 100)}</p></div><div><p className="text-muted-foreground">Time used</p><p className="mt-1 font-semibold">{timeTaken ? `${Math.round(timeTaken / 60)} min${timeLimit ? ` of ${Math.round(timeLimit / 60)}` : ""}` : "Not retained"}</p></div></CardContent></Card>
  </div>;
}

function DsaReport({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const latest = dossier.modules.dsa.latest;
  const workspaceEvidence = dossier.modules.dsa.workspaceEvidence;
  if (!latest && !workspaceEvidence) return <MissingModule name="DSA"/>;
  const answers = asRecord(latest?.answers);
  const legacyProblems = asList(answers.problems).map(asRecord);
  const submissions = workspaceEvidence?.submissions ?? [];
  const score = workspaceEvidence?.score ?? latest?.score ?? null;
  const totalPassed = submissions.length ? submissions.reduce((sum, item) => sum + item.passedCount, 0) : numeric(answers.testCasesPassed);
  const totalTests = submissions.length ? submissions.reduce((sum, item) => sum + item.totalCount, 0) : numeric(answers.testCasesTotal);
  const passedProblems = submissions.length ? submissions.filter((item) => item.passedCount === item.totalCount).length : numeric(answers.passedProblems);
  const totalProblems = submissions.length || numeric(answers.totalProblems);
  const languages = submissions.length ? [...new Set(submissions.map((item) => item.language))].join(", ") : String(answers.language ?? "Not recorded");
  return <div className="space-y-5">
    <Card><CardHeader><CardDescription>Full evidence report · executable coding round</CardDescription><CardTitle className="flex items-center gap-2 text-2xl"><Code2 className="h-6 w-6 text-primary"/>DSA implementation report</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Score" value={`${score ?? "—"}/100`} detail="Persisted coding score"/><Metric label="Problems passed" value={`${passedProblems}/${totalProblems || "—"}`} detail="Official completed submissions"/><Metric label="Test cases" value={`${totalPassed}/${totalTests || "—"}`} detail="Objective judge evidence"/><Metric label="Language" value={languages} detail="Official submission language"/></div><div className="rounded-xl border-l-4 border-l-primary bg-muted/40 p-4"><p className="font-semibold">Implementation interpretation</p><p className="mt-2 text-sm leading-7">{totalTests && totalPassed === totalTests ? "The official submissions satisfy the complete persisted test suite. The report still exposes source, complexity claims, and follow-up reasoning because passing tests alone does not establish maintainability or conceptual depth." : "The implementation is partially correct. Use the failed-test evidence and follow-up reasoning below to separate an edge-case miss from a deeper algorithmic gap."}</p></div></CardContent></Card>
    {submissions.length ? submissions.map((submission, index) => { const question = submission.question; const resultPayload = asRecord(submission.results); const rows = asList(resultPayload.results).length ? asList(resultPayload.results).map(asRecord) : asList(submission.results).map(asRecord); const followUp = asRecord(submission.followUpResults); const followRows = asList(followUp.results).map(asRecord); return <Card key={submission.id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardDescription>Problem {index + 1} · {question?.difficulty || "Difficulty not retained"}</CardDescription><CardTitle className="mt-1 text-xl">{question?.title || submission.questionId}</CardTitle></div><Badge variant={submission.passedCount === submission.totalCount ? "default" : "destructive"}>{submission.passedCount}/{submission.totalCount} tests</Badge></div></CardHeader><CardContent className="space-y-5">{question?.description ? <section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problem statement</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{question.description}</p></section> : null}{question?.constraints?.length ? <section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Constraints</p><ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">{question.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></section> : null}<section><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Official source · {submission.language}</p><span className="text-xs text-muted-foreground">Submitted {new Date(submission.submittedAt).toLocaleString()}</span></div><pre className="mt-2 max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>{submission.code}</code></pre></section><section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test-by-test evidence</p><div className="mt-2 space-y-2">{rows.length ? rows.map((row, rowIndex) => <details key={rowIndex} className="rounded-lg border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Test {rowIndex + 1} · {row.passed ? "Passed" : String(row.status || "Failed")}</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(row, null, 2)}</pre></details>) : <p className="text-sm text-muted-foreground">The judge retained only aggregate counts for this submission.</p>}</div></section><section><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up reasoning</p><p className="mt-2 text-sm"><strong>Score:</strong> {submission.followUpScore ?? "Not graded"}</p>{followRows.length ? <div className="mt-3 space-y-2">{followRows.map((row, rowIndex) => <div key={rowIndex} className="rounded-lg border p-3 text-sm"><p className="font-medium">{String(row.question || row.questionText || `Follow-up ${rowIndex + 1}`)}</p><p className="mt-2 text-muted-foreground">{String(row.answer || row.selectedAnswer || row.explanation || "Response retained in structured result")}</p><details className="mt-2"><summary className="cursor-pointer text-xs text-primary">Inspect grading payload</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(row, null, 2)}</pre></details></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No per-question follow-up payload was retained.</p>}</section></CardContent></Card>; }) : null}
    {!submissions.length ? <Card><CardHeader><CardTitle className="text-base">Problem-by-problem evidence</CardTitle><CardDescription>This is the legacy result path. The report shows every retained problem fact and explicitly marks what is absent.</CardDescription></CardHeader><CardContent className="space-y-3">{legacyProblems.length ? legacyProblems.map((problem, index) => <details key={index} className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{String(problem.title || `Problem ${index + 1}`)} · {String(problem.status || "recorded")} · {String(problem.score ?? "—")} pts</summary><div className="mt-4 grid gap-3 text-sm md:grid-cols-2"><p><strong>Time:</strong> {String(problem.timeComplexity || "not retained")}</p><p><strong>Space:</strong> {String(problem.spaceComplexity || "not retained")}</p><p className="md:col-span-2"><strong>Approach:</strong> {String(problem.approach || "Not retained")}</p>{problem.code ? <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100 md:col-span-2"><code>{String(problem.code)}</code></pre> : <p className="rounded-lg bg-amber-50 p-3 text-amber-900 md:col-span-2">Source code was not persisted in this legacy result record.</p>}</div></details>) : <p className="text-sm text-muted-foreground">No per-problem evidence was persisted.</p>}</CardContent></Card> : null}
    <Card><CardHeader><CardTitle className="text-base">Complexity, correctness, and evidence limits</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-7"><p>{String(answers.complexityAssessment || (submissions.length ? "Complexity must be audited from the official source above; the judge validates behavior, not asymptotic claims." : "No structured complexity assessment was persisted for this attempt."))}</p><p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">A passing judge result proves behavior only for the retained cases. It does not by itself prove optimality, readability, or production safety; those claims must be supported by source and follow-up evidence.</p></CardContent></Card>
  </div>;
}

function AntigravityReport({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const latest = dossier.modules.antigravity.latest;
  if (!latest) return <MissingModule name="Antigravity"/>;
  const report = asRecord(latest.report);
  const coverage = asRecord(report.coverage_portrait);
  const domain = asRecord(coverage.primary_domain);
  const baseUrl = String(import.meta.env.VITE_ANTIGRAVITY_PUBLIC_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const previewCaseId = String(report.preview_replay_case_id || "");
  const recruiterUrl = previewCaseId
    ? `${baseUrl}/report-preview/${encodeURIComponent(previewCaseId)}`
    : `${baseUrl}/report/${encodeURIComponent(latest.antigravitySessionId)}`;
  const candidateUrl = previewCaseId
    ? `${baseUrl}/report-preview/${encodeURIComponent(previewCaseId)}?view=candidate`
    : `${baseUrl}/report/${encodeURIComponent(latest.antigravitySessionId)}/candidate`;
  return <div className="space-y-5">
    <Card className="border-primary/30"><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardDescription>ProvenHire index · {latest.schemaVersion}</CardDescription><CardTitle className="mt-2 flex items-center gap-2 text-2xl"><RadioTower className="h-6 w-6 text-primary"/>Antigravity evidence report</CardTitle><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">The complete multi-section report lives in Antigravity. ProvenHire retains the score, searchable evidence, provenance, and stable links to both authorized views.</p></div><div className="flex flex-wrap gap-2"><Button asChild><a href={recruiterUrl} target="_blank" rel="noreferrer">Open full recruiter report <ExternalLink className="ml-2 h-4 w-4"/></a></Button><Button asChild variant="outline"><a href={candidateUrl} target="_blank" rel="noreferrer">Open candidate reflection <ExternalLink className="ml-2 h-4 w-4"/></a></Button></div></div></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Score" value={`${latest.overallScore ?? "—"}/10`} detail="Evidence-weighted interview score"/><Metric label="Verdict" value={latest.hireRecommendation || "—"} detail="Final evaluator recommendation"/><Metric label="Confidence" value={latest.confidenceScore == null ? "—" : `${Math.round(latest.confidenceScore * 100)}%`} detail="Evaluator confidence"/><Metric label="Telemetry" value={latest._count.telemetryEvents} detail="Persisted interaction facts"/></CardContent></Card>
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
