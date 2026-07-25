import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  FileSearch,
  GraduationCap,
  Loader2,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoaderFullScreen } from "@/components/PageLoader";
import type { WorkspaceCandidateDossier } from "./types";
import type { WorkspaceAnalyticsSnapshot, WorkspaceRoundTypeKey } from "./workspaceAnalyticsTypes";
import UserWorkspaceShell from "../../dashboard/workspaces/UserWorkspaceShell";
import {
  preview,
  workspaceId as localWorkspaceId,
} from "./WorkspaceLocalPreviewPage";

type ModuleKey =
  | "overview"
  | "aptitude"
  | "dsa"
  | "sql"
  | "interview"
  | "antigravity";
type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] =>
  asList(value).map(String).filter(Boolean);
const narrativeClaim = (value: unknown, fallback = "") => {
  if (typeof value === "string") return value;
  return String(asRecord(value).claim || fallback);
};
const narrativeEvidence = (value: unknown) =>
  strings(asRecord(value).evidence);
const numeric = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const evidenceComplete = (
  dossier: WorkspaceCandidateDossier,
  module: "aptitude" | "dsa" | "sql" | "interview" | "antigravity",
) =>
  dossier.synthesis?.evidenceCompleteness?.byModule?.[
    module === "antigravity" ? "interview" : module
  ] === true || dossier.synthesis?.evidenceCompleteness?.[module] === true;
const interviewEvidenceState = (
  latest: WorkspaceCandidateDossier["modules"]["antigravity"]["latest"],
) => {
  if (!latest) return "NOT ASSESSED";
  const report = asRecord(latest.report);
  const explicit = String(report.evidence_status || "").trim();
  if (explicit) return titleize(explicit);
  const legacy = String(latest.hireRecommendation || "").toUpperCase();
  if (legacy.includes("INSUFFICIENT")) return "INSUFFICIENT INTERVIEW EVIDENCE";
  if (legacy.includes("NO HIRE")) return "LIMITED INTERVIEW EVIDENCE";
  if (legacy.includes("HIRE") && !legacy.includes("MAYBE"))
    return "SUBSTANTIAL INTERVIEW EVIDENCE";
  return "MIXED INTERVIEW EVIDENCE";
};
const titleize = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const normalizeTitle = (value: unknown) => String(value ?? "").trim().toLowerCase();
// Prefers a title match (problemReads ordering isn't contractually guaranteed
// to mirror the submission list); falls back to positional alignment only
// when the two arrays are the same length, so a partial/mismatched
// problemReads array never gets silently misattributed to the wrong problem.
const matchProblemRead = (
  problemReads: Json[],
  title: unknown,
  index: number,
  totalCount: number,
): Json | undefined => {
  const byTitle = problemReads.find(
    (read) => normalizeTitle(read.title) === normalizeTitle(title),
  );
  if (byTitle) return byTitle;
  return problemReads.length === totalCount ? problemReads[index] : undefined;
};

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function EvidenceItems({
  items,
  empty = "No evidence recorded.",
}: {
  items: string[];
  empty?: string;
}) {
  if (!items.length) {
    return <p className="text-sm leading-6 text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-2 leading-6">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CitationList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium">
        {items.length} evidence source{items.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-2 space-y-2">
        {items.map((item) => {
          const separator = item.indexOf(" :: ");
          const pointer = separator > 0 ? item.slice(0, separator) : item;
          const excerpt = separator > 0 ? item.slice(separator + 4) : "";
          return (
            <li key={item} className="rounded-md bg-muted/50 p-2 leading-5">
              <code className="break-all">{pointer}</code>
              {excerpt ? <span className="mt-1 block">Recorded value: {excerpt}</span> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function EvidenceList({
  title,
  items,
  empty = "No evidence recorded.",
}: {
  title: string;
  items: string[];
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <EvidenceItems items={items} empty={empty} />
      </CardContent>
    </Card>
  );
}

function ScoreBreakdown({
  values,
  scale = 100,
}: {
  values: Json;
  scale?: number;
}) {
  const entries = Object.entries(values).filter(([, value]) =>
    Number.isFinite(Number(value)),
  );
  if (!entries.length)
    return (
      <p className="text-sm text-muted-foreground">
        No structured score breakdown was persisted.
      </p>
    );
  return (
    <div className="space-y-4">
      {entries.map(([key, raw]) => {
        const value = numeric(raw);
        const percent = Math.min(100, scale === 10 ? value * 10 : value);
        return (
          <div key={key}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>{titleize(key)}</span>
              <span className="font-semibold">
                {value}/{scale}
              </span>
            </div>
            <Progress value={percent} />
          </div>
        );
      })}
    </div>
  );
}

type AgentGeneration = NonNullable<
  NonNullable<WorkspaceCandidateDossier["agentReports"]>["dsa"]
>;

type QueuedReport = {
  kind: "dsa" | "unified";
  baselineCompletedAt: string | null;
};

type ReportAudience = "admin" | "candidate";

function AdminDecisionBanner({
  kind,
  dossier,
}: {
  kind: "aptitude" | "dsa" | "unified";
  dossier: WorkspaceCandidateDossier;
}) {
  const aptitude =
    dossier.modules.aptitude.workspaceEvidence?.score ??
    dossier.modules.aptitude.latest?.score ??
    null;
  const dsa =
    dossier.modules.dsa.workspaceEvidence?.score ??
    dossier.modules.dsa.latest?.score ??
    null;
  const synthesis = dossier.synthesis;
  const score = kind === "aptitude" ? aptitude : kind === "dsa" ? dsa : null;
  const moduleComplete =
    kind === "unified" ? true : evidenceComplete(dossier, kind);
  const decision =
    kind === "unified"
      ? titleize((synthesis?.recommendation || "insufficient evidence").toLowerCase())
      : score == null
        ? "Assessment evidence unavailable"
        : !moduleComplete
          ? "Partial evidence. Decision use blocked"
        : kind === "aptitude"
          ? "Objective signal recorded"
          : "Coding evidence recorded";
  const aptitudeAnswers = asRecord(
    dossier.modules.aptitude.workspaceEvidence ??
      dossier.modules.aptitude.latest?.answers,
  );
  const aptitudeReview = asList(aptitudeAnswers.questionReview);
  const aptitudeTotal = numeric(
    aptitudeAnswers.totalQuestions ?? aptitudeAnswers.questions,
  );
  const dsaSubmissions =
    dossier.modules.dsa.workspaceEvidence?.submissions ??
    asList(asRecord(dossier.modules.dsa.latest?.answers).problems).map(
      asRecord,
    );
  const fullyPassed = dsaSubmissions.filter((raw) => {
    const row = asRecord(raw);
    const passed = numeric(row.passedCount ?? row.testCasesPassed);
    const total = numeric(row.totalCount ?? row.testCasesTotal);
    return total > 0 && passed === total;
  }).length;
  const proofs =
    kind === "aptitude"
      ? [
          `${score ?? "Not available"}/100 stored result${moduleComplete ? "" : " (not fully auditable)"}`,
          `${String(aptitudeAnswers.correct ?? "Not available")} correct responses`,
          aptitudeReview.length === aptitudeTotal && aptitudeTotal > 0
            ? `All ${aptitudeTotal} question records retained`
            : `${aptitudeReview.length}/${aptitudeTotal || "?"} question records retained`,
        ]
      : kind === "dsa"
        ? [
            `${score ?? "Not available"}/100 stored result${moduleComplete ? "" : " (not fully auditable)"}`,
            `${fullyPassed}/${dsaSubmissions.length} submissions passed every retained test`,
            moduleComplete
              ? "Problem, source, and test evidence are reproducible below"
              : "At least one correctness concern lacks reproducible judge evidence",
          ]
        : [
            `${synthesis?.completedModules ?? 0}/3 module results available`,
            `${synthesis?.evidenceBasis.scoreSpread ?? 0}-point disagreement to resolve`,
            synthesis?.integrity?.status === "verified"
              ? "Artifact binding verified"
              : "Artifact binding requires correction",
          ];
  const action =
    kind === "unified"
      ? synthesis?.overallRead ||
        "Collect the missing evidence before a human reviewer records a decision."
      : moduleComplete
        ? "This module is one input to a human review. It does not independently approve or reject the candidate."
        : "A score exists, but the retained source is incomplete. Do not use this module in a hiring decision until the missing evidence is recovered or the assessment is rerun.";
  return (
    <Card className="border-slate-700/60 bg-slate-950">
      <CardContent className="p-6 text-white md:p-8">
        <div>
          <p className="text-sm font-medium text-slate-300">
            {kind === "unified"
              ? "Decision-support status"
              : `${kind} assessment status`}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {decision}
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-200">
            {action}
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {proofs.map((proof, index) => (
            <div
              key={proof}
              className="rounded-lg border border-white/15 bg-white/[0.06] p-3"
            >
              <p className="text-sm font-semibold text-violet-300">
                Evidence {index + 1}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-100">{proof}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AgentReasoningReport({
  title,
  report,
  generating,
  onGenerate,
}: {
  title: string;
  report?: AgentGeneration | null;
  generating?: boolean;
  onGenerate?: () => void;
}) {
  const result = asRecord(report?.result);
  const strengths = asList(
    result.verifiedStrengths ?? result.reinforcingSignals,
  ).map(asRecord);
  const concerns = asList(
    result.failureAndRiskAnalysis ?? result.contradictions,
  ).map(asRecord);
  const role = asRecord(result.roleReadiness ?? result.roleFit);
  const executiveRead = result.executiveRead;
  const thesis = result.crossModuleThesis || result.algorithmicReasoning;
  if (!report)
    return (
      <Card className="border-dashed border-primary/40">
        <CardContent className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-5 w-5 text-primary" />
              {title}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Generate an advisory, versioned interpretation of persisted
              evidence. It may organize citations and contradictions, but it
              cannot make the hiring decision.
            </p>
          </div>
          {onGenerate ? (
            <Button onClick={onGenerate} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generating ? "Generating…" : "Generate reasoning report"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  return (
    <Card className="border-indigo-400/40">
      <CardHeader className="border-b bg-indigo-950/35">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardDescription>
              Advisory interpretation of persisted, source-hashed evidence
            </CardDescription>
            <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
              <FileSearch className="h-6 w-6 text-indigo-400" />
              {title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Requires human review
            </Badge>
            {onGenerate ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={onGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Regenerate
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <section>
          <h3 className="text-base font-semibold">Evidence interpretation</h3>
          <p className="mt-3 text-base leading-8">
            {narrativeClaim(executiveRead, "No executive read was returned.")}
          </p>
          <CitationList items={narrativeEvidence(executiveRead)} />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            This narrative cannot create missing evidence, assign a hiring
            outcome, or replace a named reviewer applying the employer rubric.
          </p>
        </section>
        {thesis ? (
          <section className="rounded-xl bg-indigo-50 p-4">
            <p className="font-semibold text-indigo-950">Reasoning thesis</p>
            <p className="mt-2 text-sm leading-7 text-indigo-950/80">
              {narrativeClaim(thesis)}
            </p>
            <CitationList items={narrativeEvidence(thesis)} />
          </section>
        ) : null}
        <div className="grid gap-6 border-y py-5 lg:grid-cols-2">
          <section>
            <h3 className="mb-3 text-base font-semibold">Evidence-backed strengths</h3>
            <div className="space-y-3">
              {strengths.length ? (
                strengths.map((item, index) => (
                  <div key={index} className="border-b pb-3 last:border-b-0 last:pb-0">
                    <p className="font-medium">{String(item.claim)}</p>
                    <CitationList items={strings(item.evidence)} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No verified strength claim returned.
                </p>
              )}
            </div>
          </section>
          <section>
            <h3 className="mb-3 text-base font-semibold">Contradictions and risks</h3>
            <div className="space-y-3">
              {concerns.length ? (
                concerns.map((item, index) => (
                  <div key={index} className="border-b pb-3 last:border-b-0 last:pb-0">
                    <p className="font-medium">{String(item.claim)}</p>
                    <CitationList items={strings(item.evidence)} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No material contradiction returned.
                </p>
              )}
            </div>
          </section>
        </div>
        {Object.keys(role).length ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[
              ["Ready now", strings(role.readyFor ?? role.readyNow)],
              ["Conditional support", strings(role.needsSupportFor ?? role.conditional)],
              ["Not yet proven", strings(role.avoidUntilVerified ?? role.notYetProven)],
            ].map(([label, items]) => (
              <section key={String(label)}>
                <h3 className="mb-3 text-sm font-semibold">{String(label)}</h3>
                <EvidenceItems items={items as string[]} />
              </section>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
          <span>Model: {report.model}</span>
          <span>
            Generated:{" "}
            {report.completedAt
              ? new Date(report.completedAt).toLocaleString()
              : "—"}
          </span>
          <span>Generation ID: {report.id}</span>
        </div>
      </CardContent>
    </Card>
  );
}

type DecisionRating = "meets" | "partial" | "not_demonstrated" | "conflicting";
type DecisionDraftRating = DecisionRating | "unassessed";

type DecisionPayload = {
  outcome: "advance" | "hold" | "reject" | "additional_evidence";
  rationale: string;
  rubricAssessments: Array<{
    responsibility: string;
    rating: DecisionRating;
    rationale: string;
    evidenceRefs: string[];
  }>;
};

function HumanDecisionPanel({
  dossier,
  onRecord,
  recording,
}: {
  dossier: WorkspaceCandidateDossier;
  onRecord?: (payload: DecisionPayload) => Promise<void>;
  recording?: boolean;
}) {
  const responsibilities =
    dossier.synthesis?.roleRubric?.responsibilities ?? [];
  const existing = dossier.recordedDecision;
  const [outcome, setOutcome] = useState<DecisionPayload["outcome"]>(
    existing?.outcome ?? "additional_evidence",
  );
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [assessments, setAssessments] = useState<
    Array<
      Omit<DecisionPayload["rubricAssessments"][number], "rating"> & {
        rating: DecisionDraftRating;
      }
    >
  >(() =>
    responsibilities.map((responsibility) => ({
      responsibility,
      rating: "unassessed",
      rationale: "",
      evidenceRefs: [],
    })),
  );
  const gatesReady =
    dossier.synthesis?.integrity?.status === "verified" &&
    dossier.synthesis.completedModules ===
      dossier.synthesis.requiredModules.length &&
    dossier.synthesis.decisionStatus === "human_review_required" &&
    responsibilities.length >= 3;
  const complete =
    rationale.trim().length >= 30 &&
    assessments.length === responsibilities.length &&
    assessments.every(
      (item) =>
        item.rating !== "unassessed" &&
        item.rationale.trim().length >= 10 &&
        item.evidenceRefs.length > 0,
    );

  const updateAssessment = (
    index: number,
    patch: Partial<
      Omit<DecisionPayload["rubricAssessments"][number], "rating"> & {
        rating: DecisionDraftRating;
      }
    >,
  ) =>
    setAssessments((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );

  return (
    <Card className="border-slate-300">
      <CardHeader>
        <CardDescription>Named human review</CardDescription>
        <CardTitle className="text-2xl">Record accountable decision</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          The AI report is advisory. A named reviewer must assess every employer
          responsibility, cite evidence, and own the final rationale.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {existing ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">
              Recorded: {titleize(existing.outcome)} by{" "}
              {existing.reviewer.name || existing.reviewer.email}
            </p>
            <p className="mt-1">
              Evidence hash: {existing.evidenceHash.slice(0, 16)}…
            </p>
            <p className="mt-1">
              Last updated: {new Date(existing.updatedAt).toLocaleString()}
            </p>
          </div>
        ) : null}
        {!gatesReady ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            Decision entry remains locked until evidence binding, complete
            auditable source data for every configured module, and the employer
            role rubric are ready.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Outcome</label>
              <Select
                value={outcome}
                onValueChange={(value: DecisionPayload["outcome"]) =>
                  setOutcome(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                  <SelectItem value="additional_evidence">
                    Collect additional evidence
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">
                Decision rationale
              </label>
              <Textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={4}
                placeholder="Explain why the evidence supports this outcome and how contradictions were resolved."
              />
            </div>
            <div className="space-y-4">
              {assessments.map((assessment, index) => (
                <div
                  key={assessment.responsibility}
                  className="rounded-xl border p-4"
                >
                  <p className="font-semibold">{assessment.responsibility}</p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
                    <Select
                      value={assessment.rating}
                      onValueChange={(rating: DecisionDraftRating) =>
                        updateAssessment(index, { rating })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassessed" disabled>
                          Select an evidence rating
                        </SelectItem>
                        <SelectItem value="meets">Meets</SelectItem>
                        <SelectItem value="partial">
                          Partially demonstrated
                        </SelectItem>
                        <SelectItem value="not_demonstrated">
                          Not demonstrated
                        </SelectItem>
                        <SelectItem value="conflicting">
                          Conflicting evidence
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={assessment.evidenceRefs.join(", ")}
                      onChange={(event) =>
                        updateAssessment(index, {
                          evidenceRefs: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Evidence references, comma separated"
                    />
                  </div>
                  <Textarea
                    className="mt-3"
                    value={assessment.rationale}
                    onChange={(event) =>
                      updateAssessment(index, {
                        rationale: event.target.value,
                      })
                    }
                    rows={3}
                    placeholder="Explain what the cited evidence proves or leaves unresolved."
                  />
                </div>
              ))}
            </div>
            <Button
              disabled={!onRecord || recording || !complete}
              onClick={() =>
                onRecord?.({
                  outcome,
                  rationale,
                  rubricAssessments: assessments.map((assessment) => ({
                    ...assessment,
                    rating: assessment.rating as DecisionRating,
                  })),
                })
              }
            >
              {recording ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Record human decision
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const OVERVIEW_MODULE_LABEL: Record<WorkspaceRoundTypeKey, string> = {
  mcq: "Aptitude",
  coding: "Coding",
  sql: "SQL",
  interview: "AI interview",
};
const OVERVIEW_WEAK_CATEGORY_GAP = 8;

function candidateAptitudeCategoryScores(dossier: WorkspaceCandidateDossier): Array<{ name: string; score: number }> {
  return (dossier.modules.aptitude.workspaceEvidence?.categories ?? []).map((c) => ({
    name: c.name,
    score: c.score,
  }));
}

function candidateInterviewDimensionScores(
  dossier: WorkspaceCandidateDossier,
): Array<{ name: string; score: number }> {
  const report = asRecord(dossier.modules.interview.latest?.report);
  const scorecard = asRecord(report.scorecard);
  const dimensionScores = asRecord(scorecard.dimensionScores);
  return Object.entries(dimensionScores)
    .map(([name, value]) => ({ name, score: Number(value) }))
    .filter((entry) => Number.isFinite(entry.score));
}

function WorkspaceAverageComparison({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const [analytics, setAnalytics] = useState<WorkspaceAnalyticsSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ analytics: WorkspaceAnalyticsSnapshot }>(`/api/workspaces/${dossier.workspaceId}/analytics`)
      .then((res) => {
        if (!cancelled) setAnalytics(res.analytics);
      })
      .catch(() => {
        if (!cancelled) setAnalytics(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dossier.workspaceId]);

  if (!analytics) return null;

  const ownScoreByType: Record<WorkspaceRoundTypeKey, number | null> = {
    mcq: dossier.synthesis?.evidenceBasis.aptitudeScore ?? null,
    coding: dossier.synthesis?.evidenceBasis.dsaScore ?? null,
    sql: dossier.synthesis?.evidenceBasis.sqlScore ?? null,
    interview: dossier.synthesis?.evidenceBasis.interviewScore ?? null,
  };
  const candidateCategoriesByType: Partial<Record<WorkspaceRoundTypeKey, Array<{ name: string; score: number }>>> = {
    mcq: candidateAptitudeCategoryScores(dossier),
    interview: candidateInterviewDimensionScores(dossier),
  };

  const configuredTypes = (Object.entries(analytics.modules) as [WorkspaceRoundTypeKey, typeof analytics.modules[WorkspaceRoundTypeKey]][])
    .filter(([, summary]) => summary.configured);
  if (configuredTypes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Workspace comparison</CardDescription>
        <CardTitle className="text-2xl">How this candidate compares to the workspace average</CardTitle>
        <p className="text-sm text-muted-foreground">
          Based on {analytics.workspace.totalCandidates} registered candidate
          {analytics.workspace.totalCandidates === 1 ? "" : "s"} in this workspace, generated{" "}
          {new Date(analytics.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {configuredTypes.map(([type, summary]) => {
            const ownScore = ownScoreByType[type];
            const delta = ownScore !== null && summary.avgPercentageScore !== null ? ownScore - summary.avgPercentageScore : null;
            return (
              <Metric
                key={type}
                label={OVERVIEW_MODULE_LABEL[type]}
                value={ownScore !== null ? `${ownScore}%` : "—"}
                detail={
                  summary.avgPercentageScore !== null
                    ? `Workspace average ${summary.avgPercentageScore}%${delta !== null ? ` · ${delta > 0 ? "+" : ""}${delta} vs. average` : ""}`
                    : "No completed peer results yet."
                }
              />
            );
          })}
        </div>
        {configuredTypes.some(([type]) => candidateCategoriesByType[type]?.length) ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {configuredTypes.map(([type, summary]) => {
              const own = candidateCategoriesByType[type];
              if (!own?.length) return null;
              const weak = own.filter((c) => {
                const groupCategory = summary.categories.find((g) => g.name === c.name);
                return groupCategory && groupCategory.avgScore - c.score >= OVERVIEW_WEAK_CATEGORY_GAP;
              });
              const strong = own.filter((c) => {
                const groupCategory = summary.categories.find((g) => g.name === c.name);
                return groupCategory && c.score - groupCategory.avgScore >= OVERVIEW_WEAK_CATEGORY_GAP;
              });
              if (weak.length === 0 && strong.length === 0) return null;
              return (
                <div key={type} className="rounded-xl border p-4">
                  <p className="font-semibold">{OVERVIEW_MODULE_LABEL[type]} categories</p>
                  {strong.length > 0 ? (
                    <p className="mt-2 text-sm leading-6">
                      <span className="font-medium text-emerald-700">Ahead of the group: </span>
                      {strong.map((c) => titleize(c.name)).join(", ")}
                    </p>
                  ) : null}
                  {weak.length > 0 ? (
                    <p className="mt-2 text-sm leading-6">
                      <span className="font-medium text-rose-700">Behind the group: </span>
                      {weak.map((c) => titleize(c.name)).join(", ")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Overview({
  dossier,
  generating,
  onGenerate,
  onRecordDecision,
  recordingDecision,
}: {
  dossier: WorkspaceCandidateDossier;
  generating?: boolean;
  onGenerate?: () => void;
  onRecordDecision?: (payload: DecisionPayload) => Promise<void>;
  recordingDecision?: boolean;
}) {
  const synthesis = dossier.synthesis;
  if (!synthesis)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          The backend did not emit a cross-module synthesis for this legacy
          dossier. Refresh after the updated service is running.
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-5">
      <AdminDecisionBanner kind="unified" dossier={dossier} />
      {synthesis.decisionStatus === "human_review_required" ? (
        <AgentReasoningReport
          title="Unified candidate reasoning report"
          report={dossier.agentReports?.unified}
          generating={generating}
          onGenerate={onGenerate}
        />
      ) : (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-5 text-sm leading-7 text-amber-950">
            Unified AI interpretation is withheld. A generated narrative cannot
            repair missing question records or judge evidence; recover or rerun
            the incomplete modules first.
          </CardContent>
        </Card>
      )}
      <Card className="border-amber-300 bg-amber-50/60">
        <CardHeader>
          <CardDescription>Decision governance</CardDescription>
          <CardTitle className="text-2xl">Required decision gates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(synthesis.decisionGates ?? []).map((gate) => (
            <div key={gate.key} className="rounded-xl border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{gate.label}</p>
                <Badge
                  variant={gate.status === "ready" ? "default" : "outline"}
                  className={
                    gate.status === "blocked"
                      ? "border-rose-400 text-rose-700"
                      : ""
                  }
                >
                  {titleize(gate.status)}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {gate.detail}
              </p>
            </div>
          ))}
          {!synthesis.decisionGates?.length ? (
            <p className="text-sm text-muted-foreground">
              Decision-gate data is unavailable for this legacy dossier.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <HumanDecisionPanel
        dossier={dossier}
        onRecord={onRecordDecision}
        recording={recordingDecision}
      />
      <WorkspaceAverageComparison dossier={dossier} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aptitude evidence"
          value={
            synthesis.evidenceCompleteness?.aptitude ? "Complete" : "Partial"
          }
          detail={`Stored module result: ${synthesis.evidenceBasis.aptitudeScore ?? "—"}/100`}
        />
        <Metric
          label="DSA evidence"
          value={synthesis.evidenceCompleteness?.dsa ? "Complete" : "Partial"}
          detail={`Stored module result: ${synthesis.evidenceBasis.dsaScore ?? "—"}/100`}
        />
        {(synthesis.requiredModules?.includes("sql") ||
          synthesis.evidenceBasis.sqlScore != null) ? (
          <Metric
            label="SQL evidence"
            value={synthesis.evidenceCompleteness?.sql ? "Complete" : "Partial"}
            detail={`Stored module result: ${synthesis.evidenceBasis.sqlScore ?? "—"}/100`}
          />
        ) : null}
        <Metric
          label="Interview evidence"
          value={
            synthesis.evidenceCompleteness?.antigravity
              ? "Complete"
              : "Partial"
          }
          detail={`Recorded interview result: ${synthesis.evidenceBasis.interviewScore ?? synthesis.evidenceBasis.antigravityScore ?? "—"}/100`}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decision audit</CardTitle>
          <CardDescription>
            What each module can establish—and what it cannot establish by
            itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                "Objective baseline",
                "Aptitude establishes comprehension and structured reasoning under a fixed test.",
              ],
              [
                "Implementation proof",
                "DSA checks whether that reasoning survives executable code and test cases.",
              ],
              [
                "Pressure-tested transfer",
                "The configured interview probes ownership, mechanisms, failure boundaries, and production judgment.",
              ],
            ].map(([label, detail], index) => (
              <div key={label} className="rounded-xl border p-4">
                <Badge variant="outline">Layer {index + 1}</Badge>
                <p className="mt-3 font-semibold">{label}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {detail}
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-muted/50 p-4 text-sm leading-7">
            <strong>Calibration:</strong>{" "}
            {synthesis.decisionStatus === "human_review_required"
              ? `The complete module evidence spans ${synthesis.evidenceBasis.scoreSpread} points. Resolve any material disagreement directly; do not average unlike assessments into a hiring score.`
              : "Cross-module score comparison is withheld because at least one module is incomplete or not auditable."}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceList
          title="Signals that reinforce one another"
          items={synthesis.crossModuleSignals}
        />
        <EvidenceList
          title="Contradictions and uncertainty"
          items={synthesis.contradictions}
        />
        <EvidenceList
          title="Verified strengths"
          items={synthesis.verifiedStrengths}
        />
        <EvidenceList title="Scoped risks" items={synthesis.scopedRisks} />
      </div>
      <EvidenceList
        title="Recommended panel actions"
        items={synthesis.nextActions}
        empty="No additional panel action was generated."
      />
    </div>
  );
}

function AptitudeReport({ dossier }: { dossier: WorkspaceCandidateDossier }) {
  const persistedLatest = dossier.modules.aptitude.latest;
  const workspaceEvidence = dossier.modules.aptitude.workspaceEvidence;
  if (!persistedLatest && !workspaceEvidence)
    return <MissingModule name="Aptitude" />;
  const latest = persistedLatest ?? {
    id: workspaceEvidence!.sessionId,
    score: workspaceEvidence!.score,
    completedAt: workspaceEvidence!.completedAt || new Date().toISOString(),
    answers: workspaceEvidence,
  };
  const answers = workspaceEvidence
    ? asRecord(workspaceEvidence)
    : asRecord(latest.answers);
  const categories = asList(answers.categories).map(asRecord);
  const review = asList(answers.questionReview).map(asRecord);
  const total = numeric(
    answers.questions ?? answers.totalQuestions,
    review.length,
  );
  const correct = numeric(answers.correct);
  const attempted = Math.max(0, total - numeric(answers.skipped));
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
  const timeTaken = numeric(answers.timeTakenSeconds);
  const timeLimit = numeric(answers.timeLimitSeconds);
  const issues = review.filter((row) => String(row.outcome) !== "correct");
  const ledgerComplete = total > 0 && review.length === total;
  return (
    <div className="space-y-5">
      <AdminDecisionBanner kind="aptitude" dossier={dossier} />
      <Card>
        <CardHeader>
          <CardDescription>
            Full evidence report · objective reasoning round
          </CardDescription>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <BrainCircuit className="h-6 w-6 text-primary" />
            Aptitude reasoning report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label={ledgerComplete ? "Score" : "Stored score"}
              value={`${latest.score ?? "—"}/100`}
              detail={
                ledgerComplete
                  ? "Verified against the complete question ledger"
                  : "Not decision-ready: the full ledger is missing"
              }
            />
            <Metric
              label={ledgerComplete ? "Accuracy" : "Reported accuracy"}
              value={ledgerComplete ? `${accuracy}%` : "Withheld"}
              detail={
                ledgerComplete
                  ? `${correct} correct across ${attempted} attempted`
                  : `${correct} correct is recorded, but only ${review.length}/${total || "?"} answers are auditable`
              }
            />
            <Metric
              label="Incorrect"
              value={String(answers.incorrect ?? "—")}
              detail="Responses that need review"
            />
            <Metric
              label="Skipped"
              value={String(answers.skipped ?? "—")}
              detail="Unattempted questions"
            />
          </div>
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="font-semibold">Reasoning interpretation</p>
            <p className="mt-2 text-sm leading-7">
              {!ledgerComplete
                ? "Interpretation is withheld because the complete question ledger is unavailable. The stored score and counts may be displayed as historical facts, but they cannot support domain or hiring conclusions."
                : accuracy >= 90
                ? "The attempt shows high objective precision with a very small error surface. The report still separates wrong and skipped items so the panel can distinguish a knowledge gap from time allocation."
                : accuracy >= 75
                  ? "The baseline is positive, but the error ledger should be reviewed for repeated domain or time-pressure patterns."
                  : "The objective signal is mixed. Treat the aggregate score as a starting point and inspect the question-level evidence before making a decision."}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Reasoning-domain breakdown
          </CardTitle>
          <CardDescription>
            Where the candidate's objective aptitude signal is strongest or
            weakest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ledgerComplete && categories.length ? (
            <div className="space-y-4">
              {categories.map((category, index) => (
                <div key={index}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>
                      {String(category.name || `Category ${index + 1}`)}
                    </span>
                    <span className="font-semibold">
                      {numeric(category.score)}/100
                    </span>
                  </div>
                  <Progress value={numeric(category.score)} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {ledgerComplete
                ? "Category-level evidence was not persisted."
                : "Domain conclusions are withheld until every question and its domain mapping are retained."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <XCircle className="h-4 w-4 text-rose-600" />
            Error and omission review
          </CardTitle>
          <CardDescription>
            Every persisted incorrect or skipped response, including the
            expected answer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {issues.length ? (
            issues.map((row, index) => (
              <div
                key={String(row.id ?? index)}
                className="rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {String(row.question || `Question ${index + 1}`)}
                  </p>
                  <Badge
                    variant={
                      String(row.outcome) === "skipped"
                        ? "outline"
                        : "destructive"
                    }
                  >
                    {String(row.outcome)}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Candidate answer
                    </p>
                    <p className="mt-1">
                      {String(row.selectedAnswer || "No answer submitted")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Correct answer
                    </p>
                    <p className="mt-1 font-medium text-emerald-700">
                      {String(row.correctAnswer || "Not retained")}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No question-level errors were persisted for this attempt.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4" />
            {ledgerComplete
              ? "Complete question ledger"
              : `Retained question ledger · ${review.length}/${total || "?"}`}
          </CardTitle>
          <CardDescription>
            {ledgerComplete
              ? "Every question record is retained. Open an item to audit its prompt, answer, expected answer, and marks."
              : "This is a partial historical record. Do not treat undisplayed questions as audited evidence."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {review.length ? (
            review.map((row, index) => (
              <details
                key={String(row.id ?? index)}
                className="rounded-lg border px-4 py-3"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  Question {index + 1} ·{" "}
                  {titleize(String(row.outcome || "recorded"))} ·{" "}
                  {numeric(row.marks, 1)} mark(s)
                </summary>
                <div className="mt-4 space-y-3 text-sm">
                  <p className="font-medium leading-6">
                    {String(row.question)}
                  </p>
                  {asList(row.options).length ? (
                    <ol className="list-inside list-[upper-alpha] space-y-1 text-muted-foreground">
                      {asList(row.options).map((option, optionIndex) => (
                        <li key={optionIndex}>{String(option)}</li>
                      ))}
                    </ol>
                  ) : null}
                  <p>
                    <strong>Submitted:</strong>{" "}
                    {String(row.selectedAnswer || "Skipped")}
                  </p>
                  <p>
                    <strong>Expected:</strong>{" "}
                    {String(row.correctAnswer || "Not retained")}
                  </p>
                </div>
              </details>
            ))
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              This historical attempt predates question-level persistence. New
              submissions now retain the review ledger; this report will not
              fabricate missing prompts or answers.
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4" />
            Attempt and timing record
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Completed</p>
            <p className="mt-1 font-semibold">
              {new Date(latest.completedAt).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Raw earned marks</p>
            <p className="mt-1 font-semibold">
              {String(answers.earnedMarks ?? latest.score ?? "—")} of{" "}
              {String(answers.totalMarks ?? 100)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Time used</p>
            <p className="mt-1 font-semibold">
              {timeTaken
                ? `${Math.round(timeTaken / 60)} min${timeLimit ? ` of ${Math.round(timeLimit / 60)}` : ""}`
                : "Not retained"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DsaReport({
  dossier,
  generating,
  onGenerate,
}: {
  dossier: WorkspaceCandidateDossier;
  generating?: boolean;
  onGenerate?: () => void;
}) {
  const latest = dossier.modules.dsa.latest;
  const workspaceEvidence = dossier.modules.dsa.workspaceEvidence;
  if (!latest && !workspaceEvidence) return <MissingModule name="DSA" />;
  const answers = asRecord(latest?.answers);
  const legacyProblems = asList(answers.problems).map(asRecord);
  const submissions = workspaceEvidence?.submissions ?? [];
  const score = workspaceEvidence?.score ?? latest?.score ?? null;
  const totalPassed = submissions.length
    ? submissions.reduce((sum, item) => sum + item.passedCount, 0)
    : numeric(answers.testCasesPassed);
  const totalTests = submissions.length
    ? submissions.reduce((sum, item) => sum + item.totalCount, 0)
    : numeric(answers.testCasesTotal);
  const passedProblems = submissions.length
    ? submissions.filter((item) => item.passedCount === item.totalCount).length
    : legacyProblems.length
      ? legacyProblems.filter(
          (item) =>
            numeric(item.testCasesTotal) > 0 &&
            numeric(item.testCasesPassed) === numeric(item.testCasesTotal),
        ).length
      : numeric(answers.passedProblems);
  const totalProblems = submissions.length || numeric(answers.totalProblems);
  const languages = submissions.length
    ? [...new Set(submissions.map((item) => item.language))].join(", ")
    : String(answers.language ?? "Not recorded");
  const complete = evidenceComplete(dossier, "dsa");
  const dsaResult = asRecord(dossier.agentReports?.dsa?.result);
  const problemReads = complete ? asList(dsaResult.problemReads).map(asRecord) : [];
  const dsaDifficultyLedger = new Map<string, { correct: number; total: number }>();
  for (const submission of submissions) {
    const difficulty = titleize(String(submission.question?.difficulty || "Unspecified"));
    const current = dsaDifficultyLedger.get(difficulty) ?? { correct: 0, total: 0 };
    current.total += submission.totalCount;
    current.correct += submission.passedCount;
    dsaDifficultyLedger.set(difficulty, current);
  }
  const dsaDifficultyBreakdown = Array.from(dsaDifficultyLedger.entries()).map(([name, { correct, total }]) => ({
    name,
    score: total ? Math.round((correct / total) * 100) : 0,
    total,
  }));
  return (
    <div className="space-y-5">
      <AdminDecisionBanner kind="dsa" dossier={dossier} />
      {complete ? (
        <AgentReasoningReport
          title="DSA reasoning report"
          report={dossier.agentReports?.dsa}
          generating={generating}
          onGenerate={onGenerate}
        />
      ) : (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-5 text-sm leading-7 text-amber-950">
            AI interpretation is withheld because the persisted problem,
            source, and test evidence cannot reproduce every correctness
            concern. Recover the judge details or rerun the assessment before
            generating strengths, risks, or role conclusions.
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardDescription>
            Full evidence report · executable coding round
          </CardDescription>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Code2 className="h-6 w-6 text-primary" />
            DSA implementation report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Score"
              value={`${score ?? "—"}/100`}
              detail="Persisted coding score"
            />
            <Metric
              label="Fully passed"
              value={`${passedProblems}/${totalProblems || "—"}`}
              detail="Submissions passing every retained test"
            />
            <Metric
              label="Test cases"
              value={`${totalPassed}/${totalTests || "—"}`}
              detail="Objective judge evidence"
            />
            <Metric
              label="Language"
              value={languages}
              detail="Official submission language"
            />
          </div>
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="font-semibold">Implementation interpretation</p>
            <p className="mt-2 text-sm leading-7">
              {totalTests && totalPassed === totalTests
                ? "The official submissions satisfy the complete persisted test suite. The report still exposes source, complexity claims, and follow-up reasoning because passing tests alone does not establish maintainability or conceptual depth."
                : complete
                  ? `${totalPassed}/${totalTests || "?"} retained tests passed. At least one submission is not fully correct; its retained failure evidence must be inspected before drawing a broader conclusion.`
                  : `${totalPassed}/${totalTests || "?"} aggregate tests passed, but at least one failed case is not reproducible from the retained evidence. No broader correctness or role conclusion is allowed.`}
            </p>
          </div>
        </CardContent>
      </Card>
      {dsaDifficultyBreakdown.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score by difficulty</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dsaDifficultyBreakdown.map((entry) => (
              <div key={entry.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm">{entry.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${entry.score}%`,
                      backgroundColor: entry.score < 60 ? "#ef4444" : entry.score < 80 ? "#f59e0b" : "#10b981",
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-medium">{entry.score}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {submissions.length
        ? submissions.map((submission, index) => {
            const question = submission.question;
            const rows = parseJudgeResultRows(submission.results);
            const followUp = asRecord(submission.followUpResults);
            const followRows = asList(followUp.results).map(asRecord);
            return (
              <Card key={submission.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardDescription>
                        Problem {index + 1} ·{" "}
                        {question?.difficulty || "Difficulty not retained"}
                      </CardDescription>
                      <CardTitle className="mt-1 text-xl">
                        {question?.title || submission.questionId}
                      </CardTitle>
                    </div>
                    <Badge
                      variant={
                        submission.passedCount === submission.totalCount
                          ? "default"
                          : "destructive"
                      }
                    >
                      {submission.passedCount}/{submission.totalCount} tests
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {question?.description ? (
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Problem statement
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                        {question.description}
                      </p>
                    </section>
                  ) : null}
                  {asList(question?.examples).length ? (
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Examples
                      </p>
                      <div className="mt-2 space-y-2">
                        {asList(question?.examples).map(asRecord).map((example, exampleIndex) => (
                          <div key={exampleIndex} className="rounded-lg border bg-muted/40 p-3 text-xs">
                            {example.input !== undefined ? (
                              <p>
                                <span className="font-medium text-muted-foreground">Input: </span>
                                <code>{String(example.input)}</code>
                              </p>
                            ) : null}
                            {(example.output ?? example.expectedOutput) !== undefined ? (
                              <p className="mt-1">
                                <span className="font-medium text-muted-foreground">Output: </span>
                                <code>{String(example.output ?? example.expectedOutput)}</code>
                              </p>
                            ) : null}
                            {example.explanation ? (
                              <p className="mt-1 text-muted-foreground">{String(example.explanation)}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {question?.constraints?.length ? (
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Constraints
                      </p>
                      <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                        {question.constraints.map((constraint) => (
                          <li key={constraint}>{constraint}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {(() => {
                    const read = matchProblemRead(
                      problemReads,
                      question?.title,
                      index,
                      submissions.length,
                    );
                    if (!read?.approach && !read?.complexity) return null;
                    return (
                      <section className="rounded-xl border bg-muted/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          AI-analyzed reasoning
                        </p>
                        {read.approach ? (
                          <p className="mt-2 text-sm leading-6">
                            <strong>Approach:</strong> {String(read.approach)}
                          </p>
                        ) : null}
                        {read.complexity ? (
                          <p className="mt-2 text-sm leading-6">
                            <strong>Complexity:</strong> {String(read.complexity)}
                          </p>
                        ) : null}
                      </section>
                    );
                  })()}
                  <section>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Official source · {submission.language}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        Submitted{" "}
                        {new Date(submission.submittedAt).toLocaleString()}
                      </span>
                    </div>
                    <pre className="mt-2 max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                      <code>{submission.code}</code>
                    </pre>
                  </section>
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Test-by-test evidence
                    </p>
                    <div className="mt-2 space-y-2">
                      {rows.length ? (
                        rows.map((row, rowIndex) => (
                          <div
                            key={rowIndex}
                            className={`rounded-lg border p-3 text-xs ${row.passed ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={row.passed ? "outline" : "destructive"}>
                                Test {rowIndex + 1} · {JUDGE_STATUS_LABEL[row.status] ?? (row.passed ? "Passed" : row.status)}
                              </Badge>
                              {!row.input ? (
                                <span className="text-muted-foreground">Hidden test case</span>
                              ) : null}
                            </div>
                            {row.input ? (
                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <div>
                                  <p className="font-medium text-muted-foreground">Input</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all">{row.input}</pre>
                                </div>
                                <div>
                                  <p className="font-medium text-muted-foreground">Expected</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all">{row.expected}</pre>
                                </div>
                                <div>
                                  <p className="font-medium text-muted-foreground">Actual</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all">{row.actual}</pre>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          The judge retained only aggregate counts for this
                          submission.
                        </p>
                      )}
                    </div>
                  </section>
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Follow-up reasoning
                    </p>
                    <p className="mt-2 text-sm">
                      <strong>Score:</strong>{" "}
                      {submission.followUpScore ?? "Not graded"}
                    </p>
                    {followRows.length ? (
                      <div className="mt-3 space-y-2">
                        {followRows.map((row, rowIndex) => (
                          <div
                            key={rowIndex}
                            className="rounded-lg border p-3 text-sm"
                          >
                            <p className="font-medium">
                              {String(
                                row.question ||
                                  row.questionText ||
                                  `Follow-up ${rowIndex + 1}`,
                              )}
                            </p>
                            <p className="mt-2 text-muted-foreground">
                              {String(
                                row.answer ||
                                  row.selectedAnswer ||
                                  row.explanation ||
                                  "Response retained in structured result",
                              )}
                            </p>
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-primary">
                                Inspect grading payload
                              </summary>
                              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
                                {JSON.stringify(row, null, 2)}
                              </pre>
                            </details>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No per-question follow-up payload was retained.
                      </p>
                    )}
                  </section>
                </CardContent>
              </Card>
            );
          })
        : null}
      {!submissions.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Problem-by-problem evidence
            </CardTitle>
            <CardDescription>
              This is the legacy result path. The report shows every retained
              problem fact and explicitly marks what is absent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {legacyProblems.length ? (
              legacyProblems.map((problem, index) => (
                <details key={index} className="rounded-xl border p-4">
                  <summary className="cursor-pointer font-medium">
                    {String(problem.title || `Problem ${index + 1}`)} ·{" "}
                    {String(problem.status || "recorded")} ·{" "}
                    {String(problem.score ?? "—")} pts
                  </summary>
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <p>
                      <strong>Time:</strong>{" "}
                      {String(problem.timeComplexity || "not retained")}
                    </p>
                    <p>
                      <strong>Space:</strong>{" "}
                      {String(problem.spaceComplexity || "not retained")}
                    </p>
                    <p className="md:col-span-2">
                      <strong>Approach:</strong>{" "}
                      {String(problem.approach || "Not retained")}
                    </p>
                    {problem.code ? (
                      <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100 md:col-span-2">
                        <code>{String(problem.code)}</code>
                      </pre>
                    ) : (
                      <p className="rounded-lg bg-amber-50 p-3 text-amber-900 md:col-span-2">
                        Source code was not persisted in this legacy result
                        record.
                      </p>
                    )}
                  </div>
                </details>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No per-problem evidence was persisted.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Complexity, correctness, and evidence limits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-7">
          <p>
            {String(
              answers.complexityAssessment ||
                (submissions.length
                  ? "Complexity must be audited from the official source above; the judge validates behavior, not asymptotic claims."
                  : "No structured complexity assessment was persisted for this attempt."),
            )}
          </p>
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
            A passing judge result proves behavior only for the retained cases.
            It does not by itself prove optimality, readability, or production
            safety; those claims must be supported by source and follow-up
            evidence.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CandidateFeedbackHeader({
  title,
  score,
  summary,
  scoreLabel = "Your result",
}: {
  title: string;
  score: string;
  summary: string;
  scoreLabel?: string;
}) {
  return (
    <Card className="border-emerald-700/40 bg-emerald-950/30">
      <CardContent className="p-6 md:p-8">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-sm font-medium text-emerald-300">
              Your feedback
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-foreground/80">
              {summary}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-700/40 bg-background/40 px-5 py-4 md:min-w-44">
            <p className="text-sm text-muted-foreground">{scoreLabel}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{score}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CandidateOverview({
  dossier,
}: {
  dossier: WorkspaceCandidateDossier;
}) {
  const synthesis = dossier.synthesis;
  const result = asRecord(dossier.agentReports?.unified?.result);
  const role = asRecord(result.roleFit);
  const unifiedRead = narrativeClaim(result.executiveRead);
  const unifiedThesis = narrativeClaim(result.crossModuleThesis);
  const requiredModules = synthesis?.requiredModules ?? ["aptitude", "dsa", "interview"];
  const completeEvidenceCount = requiredModules.filter(
    (key) => synthesis?.evidenceCompleteness?.byModule?.[key] === true,
  ).length;
  const strengths = synthesis?.verifiedStrengths ?? [];
  const risks = synthesis?.scopedRisks ?? [];
  const practiceActions = (synthesis?.nextActions ?? []).filter(Boolean).slice(0, 3);
  const roundCompletion = synthesis?.roundCompletion;
  const moduleLabel: Record<string, string> = {
    aptitude: "Aptitude",
    dsa: "Coding",
    sql: "SQL",
    interview: "AI interview",
  };
  const peerStandingLabel: Record<string, string> = {
    above_average: "Above cohort average",
    near_average: "Near cohort average",
    below_average: "Below cohort average",
    not_available: "Not enough peer results yet",
  };
  const consistentAcrossRounds = [
    ...(synthesis?.crossModuleSignals ?? []),
    ...(synthesis?.crossRoundHighlights ?? []),
  ];
  const worthResolvingAcrossRounds = [
    ...(synthesis?.contradictions ?? []),
    ...(synthesis?.crossRoundConcerns ?? []),
  ];
  return (
    <div className="space-y-5">
      <CandidateFeedbackHeader
        title="Your complete assessment feedback"
        score={
          roundCompletion
            ? `${roundCompletion.completedRounds} of ${roundCompletion.totalRounds} rounds completed`
            : `${completeEvidenceCount} of ${requiredModules.length} results ready`
        }
        summary={`Open each completed round to see your score, detailed feedback, and the next practice action. ${completeEvidenceCount} of ${requiredModules.length} detailed result${requiredModules.length === 1 ? "" : "s"} ready to review.`}
      />
      {synthesis?.overallRead ? (
        <Card>
          <CardHeader>
            <CardTitle>Your overall read</CardTitle>
            <CardDescription>How your results add up across every round so far.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7">{synthesis.overallRead}</p>
          </CardContent>
        </Card>
      ) : null}
      {synthesis?.integrity?.status === "blocked" ? (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="p-5 text-sm leading-7 text-rose-900">
            We are verifying that this feedback belongs to your assessment. Your results are saved and no action is required right now. If this message remains, contact the organizer.
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Aptitude score"
          value={synthesis?.evidenceBasis.aptitudeScore ?? "—"}
          detail={
            synthesis?.evidenceCompleteness?.aptitude
              ? "Question review is ready"
              : "Your score is ready; detailed question review is not available"
          }
        />
        <Metric
          label="Coding score"
          value={synthesis?.evidenceBasis.dsaScore ?? "—"}
          detail={
            synthesis?.evidenceCompleteness?.dsa
              ? "Code and test feedback is ready"
              : "Your score is ready; detailed test feedback is not available"
          }
        />
        {requiredModules.includes("sql") ? (
          <Metric
            label="SQL score"
            value={synthesis?.evidenceBasis.sqlScore ?? "—"}
            detail={
              synthesis?.evidenceCompleteness?.sql
                ? "Query and test feedback is ready"
                : "Detailed SQL feedback is still being prepared"
            }
          />
        ) : null}
        <Metric
          label="AI interview score"
          value={synthesis?.evidenceBasis.interviewScore ?? synthesis?.evidenceBasis.antigravityScore ?? "—"}
          detail={
            evidenceComplete(dossier, "interview")
              ? "Detailed interview feedback is ready"
              : "Interview feedback is still being prepared"
          }
        />
      </div>
      {synthesis?.peerComparison ? (
        <Card>
          <CardHeader>
            <CardTitle>How you compare to your cohort</CardTitle>
            <CardDescription>
              Directional standing only — no peer scores are shown, and a module needs enough completed
              peer results before a comparison is shown at all.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {requiredModules.map((key) => {
              const standing = synthesis.peerComparison?.modules?.[key];
              return (
                <Metric
                  key={key}
                  label={moduleLabel[key] ?? key}
                  value={peerStandingLabel[standing?.yourStanding ?? "not_available"]}
                  detail={
                    standing && standing.yourStanding !== "not_available"
                      ? `Based on ${standing.cohortSampleSize} completed peer result${standing.cohortSampleSize === 1 ? "" : "s"} in this workspace.`
                      : "Not enough peers have completed this round yet to compare."
                  }
                />
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceList
          title="What you did well"
          items={strengths}
          empty="No verified strength was recorded yet."
        />
        <EvidenceList
          title="What to improve next"
          items={risks}
          empty="No material improvement area was recorded."
        />
        <EvidenceList
          title="Consistent across your rounds"
          items={consistentAcrossRounds}
          empty="No cross-round pattern was recorded yet."
        />
        <EvidenceList
          title="Worth resolving across rounds"
          items={worthResolvingAcrossRounds}
          empty="No cross-round concern was recorded."
        />
      </div>
      {unifiedRead || unifiedThesis ? (
        <Card>
          <CardHeader>
            <CardTitle>How your results connect</CardTitle>
            <CardDescription>
              A source-linked interpretation across completed rounds. It is
              coaching guidance, not a hiring decision.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {unifiedRead ? (
              <section>
                <h3 className="text-sm font-semibold">Cross-round read</h3>
                <p className="mt-2 text-sm leading-7">{unifiedRead}</p>
                <CitationList items={narrativeEvidence(result.executiveRead)} />
              </section>
            ) : null}
            {unifiedThesis ? (
              <section className="border-t pt-4">
                <h3 className="text-sm font-semibold">Main evidence boundary</h3>
                <p className="mt-2 text-sm leading-7">{unifiedThesis}</p>
                <CitationList items={narrativeEvidence(result.crossModuleThesis)} />
              </section>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {synthesis?.decisionStatus === "human_review_required" &&
      (synthesis.roleRubric?.responsibilities.length ?? 0) >= 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your role-readiness map</CardTitle>
            <CardDescription>
              Use this to choose projects and interview stories that strengthen
              the missing evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-3">
            {[
              ["Ready to demonstrate", strings(role.readyNow)],
              ["Build with guidance", strings(role.conditional)],
              ["Not yet proven", strings(role.notYetProven)],
            ].map(([label, items]) => (
              <section key={String(label)}>
                <h4 className="mb-3 text-sm font-semibold">{String(label)}</h4>
                <EvidenceItems items={items as string[]} />
              </section>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Priority practice plan</CardTitle>
          <CardDescription>
            These actions come from your completed rounds. Finish one, record
            the result, then move to the next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-y rounded-lg border">
            {(practiceActions.length
              ? practiceActions
              : risks.slice(0, 3).map((risk) => `Resolve this retained gap: ${risk}`)
            ).map((action, index) => (
              <li key={`${index}-${action}`} className="flex gap-4 p-4 text-sm leading-6">
                <span className="font-semibold text-primary">{index + 1}</span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
          {!practiceActions.length && !risks.length ? (
            <p className="text-sm leading-6 text-muted-foreground">
              No evidence-backed practice action is available yet. Open each
              completed round for its specific feedback.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidateAptitudeReport({
  dossier,
}: {
  dossier: WorkspaceCandidateDossier;
}) {
  const latest = dossier.modules.aptitude.latest;
  const workspace = dossier.modules.aptitude.workspaceEvidence;
  if (!latest && !workspace) {
    return (
      <MissingModule
        name="Aptitude"
        message="Complete the aptitude round to unlock your question-by-question feedback."
      />
    );
  }
  const answers = workspace ? asRecord(workspace) : asRecord(latest?.answers);
  const score = workspace?.score ?? latest?.score ?? null;
  const review = asList(answers.questionReview).map(asRecord);
  const issues = review.filter((row) => String(row.outcome) !== "correct");
  const categories = asList(answers.categories).map(asRecord);
  const total = numeric(
    answers.totalQuestions ?? answers.questions,
    review.length,
  );
  const skipped = numeric(answers.skipped);
  const correct = numeric(answers.correct);
  const attempted = Math.max(0, total - skipped);
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
  const ledgerComplete = total > 0 && review.length === total;
  const evidenceConfidence =
    ledgerComplete && total >= 20
      ? "High"
      : ledgerComplete && total >= 15
        ? "Moderate"
        : "Limited";
  const timeLimitMinutes = numeric(answers.timeLimitSeconds)
    ? Math.round(numeric(answers.timeLimitSeconds) / 60)
    : null;
  const learningGuide = (row: Json) => {
    const question = String(row.question || "").toLowerCase();
    if (question.includes("relative reduction"))
      return {
        diagnosis:
          "Likely misconception: subtracting percentages without dividing by the original baseline.",
        worked:
          "The drop is 2.5 − 1.5 = 1.0 percentage point. Relative reduction uses the original 2.5% as the baseline: 1.0 ÷ 2.5 = 0.40, so the reduction is 40%.",
        practice:
          "Success criterion: solve three baseline-change questions and state the denominator before calculating.",
      };
    if (question.includes("cache hit saves 18 ms"))
      return {
        diagnosis:
          "Likely issue: unit conversion or time allocation; no answer was submitted.",
        worked:
          "18 ms × 4,000 hits = 72,000 ms. Divide by 1,000 to convert milliseconds to seconds: 72 seconds.",
        practice:
          "Success criterion: complete three rate × saving questions in under two minutes and write the unit conversion on every line.",
      };
    return {
      diagnosis:
        "The retained data identifies the outcome but not the exact misconception.",
      worked: `Compare your submitted answer with ${String(row.correctAnswer || "the expected answer")} and write the rule that distinguishes them.`,
      practice:
        "Success criterion: solve one near-transfer and one differently worded example, then explain the governing rule aloud.",
    };
  };
  return (
    <div className="space-y-5">
      <CandidateFeedbackHeader
        title="Your aptitude feedback"
        score={score == null ? "—" : `${score}/100`}
        summary={
          !ledgerComplete
            ? `Detailed feedback is available for ${review.length} of ${total || "the"} questions. Use the available mistakes for practice; category rankings will appear once the full question history is available.`
            : total < 15
              ? `This was a ${total}-question diagnostic, not the standard 20-question ProvenHire aptitude round. The feedback is useful for practice, but the score has limited reliability.`
            : accuracy >= 85
            ? "Your reasoning accuracy is a strength. Your next improvement comes from understanding the exact wrong or skipped patterns, not from repeating the entire syllabus."
            : "Your score shows a usable baseline, but your next practice cycle should target the error patterns and time-allocation choices below."
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={ledgerComplete ? "Accuracy" : "Accuracy status"}
          value={ledgerComplete ? `${accuracy}%` : "Withheld"}
          detail={
            ledgerComplete
              ? `${correct} correct across ${attempted} attempts`
              : "Complete answer history is unavailable"
          }
        />
        <Metric
          label="Feedback confidence"
          value={evidenceConfidence}
          detail={
            !ledgerComplete
              ? `${review.length}/${total || "?"} question records are available`
              : total >= 20
              ? `${total} questions, aligned with the standard aptitude baseline`
              : `${total} questions, below the standard 20-question baseline`
          }
        />
        <Metric
          label="Skipped"
          value={skipped}
          detail="Questions where time or confidence broke down"
        />
        <Metric
          label="Time used"
          value={
            numeric(answers.timeTakenSeconds)
              ? `${Math.round(numeric(answers.timeTakenSeconds) / 60)} min`
              : "—"
          }
          detail={
            timeLimitMinutes
              ? `Recorded limit: ${timeLimitMinutes} min`
              : "Time limit was not retained"
          }
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Where you are strongest</CardTitle>
          <CardDescription>
            Your strongest categories, based on this assessment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ledgerComplete && categories.length ? (
            [...categories]
              .sort((a, b) => numeric(b.score) - numeric(a.score))
              .map((category) => (
                <div key={String(category.name)}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{String(category.name)}</span>
                    <strong>{numeric(category.score)}/100</strong>
                  </div>
                  <Progress value={numeric(category.score)} />
                </div>
              ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {ledgerComplete
                ? "This attempt did not retain domain labels."
                : "Domain rankings are withheld because the complete question-to-domain ledger is unavailable."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Questions to learn from</CardTitle>
          <CardDescription>
            Focus on why your reasoning diverged—not just the correct option.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {issues.length ? (
            issues.map((row, index) => {
              const guide = learningGuide(row);
              return (
                <div
                  key={String(row.id ?? index)}
                  className="rounded-xl border p-4"
                >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">{String(row.question)}</p>
                  <Badge variant="outline">{String(row.outcome)}</Badge>
                </div>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Your answer:</span>{" "}
                    {String(row.selectedAnswer || "Skipped")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">
                      Correct answer:
                    </span>{" "}
                    <strong>
                      {String(row.correctAnswer || "Not retained")}
                    </strong>
                  </p>
                </div>
                  <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 text-sm leading-6">
                    <p>
                      <strong>Diagnosis:</strong> {guide.diagnosis}
                    </p>
                    <p>
                      <strong>Worked reasoning:</strong> {guide.worked}
                    </p>
                    <p>
                      <strong>Practice action:</strong> {guide.practice}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              No question-level mistakes were retained.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidateDsaReport({
  dossier,
}: {
  dossier: WorkspaceCandidateDossier;
}) {
  const latest = dossier.modules.dsa.latest;
  const workspace = dossier.modules.dsa.workspaceEvidence;
  if (!latest && !workspace) {
    return (
      <MissingModule
        name="Coding / DSA"
        message="Complete the coding round to unlock your problem-by-problem report."
      />
    );
  }
  const answers = asRecord(latest?.answers);
  const result = asRecord(dossier.agentReports?.dsa?.result);
  const score = workspace?.score ?? latest?.score ?? null;
  const complete = evidenceComplete(dossier, "dsa");
  const strengths = complete
    ? asList(result.verifiedStrengths).map(asRecord)
    : [];
  const risks = complete
    ? asList(result.failureAndRiskAnalysis).map(asRecord)
    : [];
  const problemReads = complete
    ? asList(result.problemReads).map(asRecord)
    : [];
  const problems = workspace?.submissions.length
    ? workspace.submissions.map((submission, index): Json => {
        const title = submission.question?.title || submission.questionId;
        const read = matchProblemRead(
          problemReads,
          title,
          index,
          workspace.submissions.length,
        );
        return {
          title,
          description: submission.question?.description || "",
          constraints: submission.question?.constraints || [],
          examples: submission.question?.examples ?? [],
          difficulty: submission.question?.difficulty || "",
          code: submission.code,
          language: submission.language,
          testCasesPassed: submission.passedCount,
          testCasesTotal: submission.totalCount,
          results: parseJudgeResultRows(submission.results),
          approach: read?.approach ?? null,
          complexity: read?.complexity ?? null,
        };
      })
    : asList(answers.problems).map(asRecord);
  const candidateDifficultyLedger = new Map<string, { correct: number; total: number }>();
  for (const problem of problems) {
    const difficulty = titleize(String(problem.difficulty || "Unspecified"));
    const current = candidateDifficultyLedger.get(difficulty) ?? { correct: 0, total: 0 };
    current.total += numeric(problem.testCasesTotal);
    current.correct += numeric(problem.testCasesPassed);
    candidateDifficultyLedger.set(difficulty, current);
  }
  const candidateDifficultyBreakdown = Array.from(candidateDifficultyLedger.entries())
    .filter(([, { total }]) => total > 0)
    .map(([name, { correct, total }]) => ({ name, score: Math.round((correct / total) * 100) }));
  const smallestRetainedSuite = problems.length
    ? Math.min(
        ...problems.map((problem) => numeric(problem.testCasesTotal)),
      )
    : 0;
  const testCoverage =
    problems.length >= 2 && smallestRetainedSuite >= 8
      ? "High"
      : problems.length >= 2 && smallestRetainedSuite >= 6
        ? "Moderate"
        : "Limited";
  const probes = strings(
    result.candidatePracticePrompts ?? result.recommendedPanelProbes,
  );
  const candidateProbes = probes.map((probe) =>
    probe
      .replace(/^Ask the candidate to\s+/i, "Practice how to ")
      .replace(/^Introduce\s+/i, "Test your solution with "),
  );
  return (
    <div className="space-y-5">
      <CandidateFeedbackHeader
        title="Your coding feedback"
        score={score == null ? "—" : `${score}/100`}
        summary={
          !complete
            ? "Your score is saved, but some detailed solution data is unavailable. The coaching below is limited to feedback we can verify from your submission."
            : testCoverage === "Limited"
              ? `This score is based on ${problems.length} problem${problems.length === 1 ? "" : "s"}. Use it as a practice signal, and continue testing your solutions against additional edge cases.`
            : score != null && score >= 80
            ? "Your implementation signal is strong. The goal now is to close the difference between passing the retained tests and proving that your solution remains correct under edge cases, concurrency, and failure."
            : "Your implementation baseline is developing. Use the problem feedback below to separate algorithm selection, correctness, and code-quality improvements."
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Problems assessed" value={problems.length} detail="Official submitted solutions" />
        <Metric label="Smallest test suite" value={smallestRetainedSuite} detail="Judge cases retained for one problem" />
        <Metric label="Evidence confidence" value={testCoverage} detail="High confidence requires at least two problems and eight cases per problem" />
      </div>
      {candidateDifficultyBreakdown.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score by difficulty</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {candidateDifficultyBreakdown.map((entry) => (
              <div key={entry.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm">{entry.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${entry.score}%`,
                      backgroundColor: entry.score < 60 ? "#ef4444" : entry.score < 80 ? "#f59e0b" : "#10b981",
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-medium">{entry.score}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What you did well</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {strengths.length ? (
              strengths.map((item, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <p className="font-medium">{String(item.claim)}</p>
                  <CitationList items={strings(item.evidence)} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No generated coaching evidence is available yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What to improve</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {risks.length ? (
              risks.map((item, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <p className="font-medium">{String(item.claim)}</p>
                  <CitationList items={strings(item.evidence)} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No specific improvement evidence is available yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Problem-by-problem coaching</CardTitle>
          <CardDescription>
            This is about the learning pattern behind each solution, not a
            recruiter verdict.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {problems.length ? (
            problems.map((problem, index) => {
              const resultRows = parseJudgeResultRows(problem.results);
              const hasVisibleFailure = resultRows.some((row) => !row.passed && row.input);
              const isPartial =
                numeric(problem.testCasesPassed) <
                numeric(problem.testCasesTotal);
              const examples = asList(problem.examples).map(asRecord);
              return (
                <div key={index} className="rounded-xl border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">
                    {String(problem.title || `Problem ${index + 1}`)}
                  </p>
                  <Badge variant="outline">
                    {String(problem.testCasesPassed ?? "—")}/
                    {String(problem.testCasesTotal ?? "—")} tests
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6">
                  <strong>Your approach:</strong>{" "}
                  {String(
                    problem.approach ||
                      "An explicit approach explanation was not retained. Inspect your submitted source and write the invariant and complexity before your next attempt.",
                  )}
                </p>
                <p className="mt-2 text-sm leading-6">
                  <strong>Complexity:</strong>{" "}
                  {problem.complexity
                    ? String(problem.complexity)
                    : `${String(problem.timeComplexity || "—")} time · ${String(problem.spaceComplexity || "—")} space`}
                </p>
                {examples.length ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examples</p>
                    {examples.map((example, exampleIndex) => (
                      <div key={exampleIndex} className="rounded-lg border bg-muted/40 p-3 text-xs">
                        {example.input !== undefined ? (
                          <p>
                            <span className="font-medium text-muted-foreground">Input: </span>
                            <code>{String(example.input)}</code>
                          </p>
                        ) : null}
                        {(example.output ?? example.expectedOutput) !== undefined ? (
                          <p className="mt-1">
                            <span className="font-medium text-muted-foreground">Output: </span>
                            <code>{String(example.output ?? example.expectedOutput)}</code>
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {problem.code ? (
                  <details className="mt-2 rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Inspect your submitted source
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                      <code>{String(problem.code)}</code>
                    </pre>
                  </details>
                ) : null}
                {resultRows.length ? (
                  <details className="mt-2 rounded-lg border p-3" open={hasVisibleFailure}>
                    <summary className="cursor-pointer text-sm font-semibold">
                      Test case results ({resultRows.filter((r) => r.passed).length}/{resultRows.length} passed)
                    </summary>
                    <div className="mt-3 space-y-2">
                      {resultRows.map((row, rowIndex) => (
                        <div
                          key={rowIndex}
                          className={`rounded-lg border p-2 text-xs ${row.passed ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                        >
                          <Badge variant={row.passed ? "outline" : "destructive"}>
                            Test {rowIndex + 1} · {row.passed ? "Passed" : "Failed"}
                          </Badge>
                          {row.input ? (
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              <div>
                                <p className="font-medium text-muted-foreground">Input</p>
                                <pre className="mt-1 whitespace-pre-wrap break-all">{row.input}</pre>
                              </div>
                              <div>
                                <p className="font-medium text-muted-foreground">Expected</p>
                                <pre className="mt-1 whitespace-pre-wrap break-all">{row.expected}</pre>
                              </div>
                              <div>
                                <p className="font-medium text-muted-foreground">Actual</p>
                                <pre className="mt-1 whitespace-pre-wrap break-all">{row.actual}</pre>
                              </div>
                            </div>
                          ) : (
                            <span className="ml-2 text-muted-foreground">Hidden test case</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <strong>Next improvement:</strong>{" "}
                  {isPartial && hasVisibleFailure
                    ? "Reproduce the visible failed case, name the broken invariant, patch it, and add one neighboring adversarial case."
                    : isPartial
                      ? "The failed case is hidden or was not retained, so a specific patch cannot be prescribed responsibly. Ask for a public counterexample or rerun this problem with candidate-visible judge evidence."
                    : "Add one adversarial case outside the retained suite and explain why the invariant still holds."}
                </p>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              No problem-level coaching evidence was retained.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your next practice session</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {(candidateProbes.length
              ? candidateProbes
              : [
                  "Rebuild the weakest solution without looking at the original code.",
                  "Add adversarial edge cases and explain each invariant.",
                ]
            ).map((probe, index) => (
              <li
                key={probe}
                className="flex gap-3 rounded-lg border p-3 text-sm"
              >
                <span className="font-bold text-primary">{index + 1}</span>
                <span>{probe}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function AntigravityReport({
  dossier,
  audience = "admin",
}: {
  dossier: WorkspaceCandidateDossier;
  audience?: ReportAudience;
}) {
  const latest = dossier.modules.antigravity.latest;
  if (!latest)
    return (
      <MissingModule
        name={audience === "candidate" ? "AI interview" : "Antigravity"}
        message={
          audience === "candidate"
            ? "Complete the AI interview to unlock detailed feedback."
            : undefined
        }
      />
    );
  const report = asRecord(latest.report);
  const coverage = asRecord(report.coverage_portrait);
  const domain = asRecord(coverage.primary_domain);
  const coveragePercent = numeric(
    report.coverage_percentage ??
      coverage.coverage_percent ??
      coverage.completion_percentage ??
      (numeric(coverage.coverage_score) <= 1
        ? numeric(coverage.coverage_score) * 100
        : coverage.coverage_score),
  );
  const isLocalPreviewCandidate =
    import.meta.env.DEV &&
    dossier.candidate.email.endsWith("@provenhire.local");
  const defaultPublicAntigravityUrl = import.meta.env.DEV
    ? "http://localhost:3000"
    : "https://antigravity-gz2r.vercel.app";
  const configuredPublicAntigravityUrl = String(
    import.meta.env.VITE_ANTIGRAVITY_PUBLIC_URL || "",
  ).trim();
  const publicAntigravityUrl =
    import.meta.env.PROD &&
    /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(
      configuredPublicAntigravityUrl,
    )
      ? defaultPublicAntigravityUrl
      : configuredPublicAntigravityUrl || defaultPublicAntigravityUrl;
  const baseUrl = String(
    isLocalPreviewCandidate
      ? import.meta.env.VITE_ANTIGRAVITY_LOCAL_PREVIEW_URL ||
          "http://localhost:3001"
      : publicAntigravityUrl,
  ).replace(/\/$/, "");
  const previewCaseId = String(report.preview_replay_case_id || "");
  const reportAccessToken = latest.reportAccessToken || "";
  const accessQuery = reportAccessToken
    ? `?access_token=${encodeURIComponent(reportAccessToken)}`
    : "";
  const recruiterUrl = previewCaseId
    ? `${baseUrl}/report-preview/${encodeURIComponent(previewCaseId)}`
    : `${baseUrl}/report/${encodeURIComponent(latest.antigravitySessionId)}${accessQuery}`;
  const candidateUrl = previewCaseId
    ? `${baseUrl}/report-preview/${encodeURIComponent(previewCaseId)}?view=candidate`
    : `${baseUrl}/report/${encodeURIComponent(latest.antigravitySessionId)}/candidate${accessQuery}`;
  if (dossier.synthesis?.integrity?.status === "blocked") {
    if (audience === "candidate") {
      return (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-6 text-amber-950">
            <h2 className="font-semibold">We are verifying this interview report</h2>
            <p className="mt-2 text-sm leading-7">We cannot show the feedback until we confirm that it belongs to your interview. Your interview is saved, and no action is required right now. If this message remains, contact the organizer.</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="border-rose-400 bg-rose-50">
        <CardHeader>
          <CardDescription className="font-semibold text-rose-700">
            Evidence integrity gate
          </CardDescription>
          <CardTitle className="flex items-center gap-2 text-2xl text-rose-950">
            <ShieldAlert className="h-6 w-6" /> Report withheld
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-7 text-rose-950">
          <p>
            This artifact is not proven to belong to this candidate, workspace
            attempt, and target role. Its scores, transcript, telemetry, and
            external links are hidden to prevent a cross-candidate or cross-role
            decision.
          </p>
          <ul className="list-inside list-disc space-y-2">
            {dossier.synthesis.integrity.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p className="rounded-lg border border-rose-200 bg-white p-3">
            Required fix: bind the completed workspace interview attempt to the
            exact ProvenHire Interview and AntigravityReport IDs, then re-run
            the integrity gate.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (audience === "candidate")
    return (
      <div className="space-y-5">
        <CandidateFeedbackHeader
          title="Your AI interview feedback"
          score={
            latest.overallScore == null ? "—" : `${latest.overallScore}/10`
          }
          summary="See what your answers demonstrated, where they lacked detail, how you communicated under pressure, and what to practice before your next interview."
          scoreLabel="Recorded interview result"
        />
        <Card className="overflow-hidden border-emerald-300">
          <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <h3 className="text-2xl font-bold">
                View detailed interview feedback
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Open your detailed feedback for answer-by-answer review, communication guidance, knowledge gaps, and a practical 30-day improvement plan.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "Personal mirror",
                  "Concept map",
                  "Interview skills",
                  "Practice plan",
                ].map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
            <Button asChild size="lg">
              <a href={candidateUrl} target="_blank" rel="noreferrer">
                Open complete interview reflection{" "}
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <EvidenceList
            title="What the interview verified"
            items={
              strings(report.tested_strengths).length
                ? strings(report.tested_strengths)
                : strings(report.strengths)
            }
          />
          <EvidenceList
            title="What to improve or prove next"
            items={
              strings(report.tested_risks).length
                ? strings(report.tested_risks)
                : strings(report.risk_flags)
            }
          />
        </div>
      </div>
    );
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 text-white shadow-2xl">
        <CardContent className="p-6 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_.65fr] lg:items-center">
            <div>
              <Badge className="bg-violet-400/20 text-violet-100 hover:bg-violet-400/20">
                The complete interview evidence is in Antigravity
              </Badge>
              <h2 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
                This page is the index. The full report is the interview
                evidence workspace.
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-200">
                Open the recruiter report for the complete evidence map—not a
                longer version of this scorecard. It contains the evidence
                summary, tested responsibility evidence, pressure trajectory,
                claim verification, evidence heat map, limitations, and exact
                next actions. It does not make the employment decision.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-slate-950 hover:bg-slate-100"
                >
                  <a href={recruiterUrl} target="_blank" rel="noreferrer">
                    Enter complete recruiter report{" "}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href={candidateUrl} target="_blank" rel="noreferrer">
                    Open candidate reflection{" "}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {[
                ["Evidence status", "Coverage, support, and limitations"],
                ["Responsibilities", "Demonstrated, unresolved, and not assessed"],
                ["Evidence", "Heat map, probes, claims, trajectory"],
                ["Risk", "Unresolved gaps and exact validation"],
                ["Next actions", "Panel questions and evidence workflow"],
              ].map(([label, detail], index) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/15 bg-white/[0.07] p-3 backdrop-blur"
                >
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-300 text-xs font-bold text-violet-950">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{label}</p>
                      <p className="mt-0.5 text-xs text-slate-300">{detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardDescription>
                ProvenHire index · {latest.schemaVersion}
              </CardDescription>
              <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
                <RadioTower className="h-6 w-6 text-primary" />
                Antigravity evidence report
              </CardTitle>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                The complete multi-section report lives in Antigravity.
                ProvenHire retains the score, searchable evidence, provenance,
                and stable links to both authorized views.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Recorded interview result"
            value={`${latest.overallScore ?? "—"}/10`}
            detail="Interview-only scale; not comparable to Aptitude or DSA"
          />
          <Metric
            label="Evidence state"
            value={interviewEvidenceState(latest)}
            detail="Interview evidence only—not an employment outcome"
          />
          <Metric
            label="Coverage"
            value={coveragePercent ? `${coveragePercent}%` : "Not retained"}
            detail="Expected interview evidence addressed"
          />
          <Metric
            label="Telemetry"
            value={latest._count.telemetryEvents}
            detail="Persisted interaction facts"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Interview evidence interpretation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-7">
            {String(
              report.recruiter_summary ||
                report.summary ||
                "No recruiter narrative was emitted.",
            )}
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceList
          title="Verified strengths"
          items={
            strings(report.tested_strengths).length
              ? strings(report.tested_strengths)
              : strings(report.strengths)
          }
        />
        <EvidenceList
          title="Scoped risks"
          items={
            strings(report.tested_risks).length
              ? strings(report.tested_risks)
              : strings(report.risk_flags)
          }
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dimension scores</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreBreakdown values={asRecord(report.scores)} scale={10} />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceList
          title="Voluntary coverage"
          items={strings(domain.voluntary_coverage)}
        />
        <EvidenceList
          title="Missed or unresolved coverage"
          items={[
            ...strings(domain.missed_coverage),
            ...strings(domain.incorrect_coverage),
          ]}
        />
        <EvidenceList
          title="Claim calibration"
          items={asList(report.claim_findings).map((item) => {
            const row = asRecord(item);
            return `${String(row.claim || "Claim")}: ${String(row.status || "untested")} — ${String(row.interpretation || "No interpretation")}`;
          })}
        />
        <EvidenceList
          title="Recommended follow-ups"
          items={strings(report.recommended_followups)}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evidence provenance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Session</p>
            <p className="mt-1 break-all font-mono text-xs">
              {latest.antigravitySessionId}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Transcript turns</p>
            <p className="mt-1 font-semibold">
              {Array.isArray(latest.transcript) ? latest.transcript.length : 0}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Received</p>
            <p className="mt-1 font-semibold">
              {new Date(latest.receivedAt).toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type JudgeResultRow = { passed: boolean; status: string; input?: string; expected?: string; actual?: string };

function parseJudgeResultRows(value: unknown): JudgeResultRow[] {
  // Handles both a flat array of rows and a legacy { results: [...] } wrapper.
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).results)
      ? ((value as Record<string, unknown>).results as unknown[])
      : [];
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => ({
      passed: Boolean(row.passed),
      status: typeof row.status === "string" ? row.status : "UNKNOWN",
      input: typeof row.input === "string" ? row.input : undefined,
      expected: typeof row.expected === "string" ? row.expected : undefined,
      actual: typeof row.actual === "string" ? row.actual : undefined,
    }));
}

const JUDGE_STATUS_LABEL: Record<string, string> = {
  CORRECT_ANSWER: "Passed",
  WRONG_ANSWER: "Wrong answer",
  INTERNAL_ERROR: "Execution error",
};

function SqlReport({
  dossier,
  audience = "admin",
}: {
  dossier: WorkspaceCandidateDossier;
  audience?: ReportAudience;
}) {
  const evidence = dossier.modules.sql?.workspaceEvidence;
  if (!evidence)
    return (
      <MissingModule
        name="SQL"
        message={
          audience === "candidate"
            ? "Complete the SQL round to unlock your query-by-query report."
            : undefined
        }
      />
    );
  const smallestRetainedSuite = evidence.submissions.length
    ? Math.min(...evidence.submissions.map((submission) => submission.totalCount))
    : 0;
  const testCoverage =
    evidence.submissions.length >= 2 && smallestRetainedSuite >= 6
      ? "High"
      : evidence.submissions.length >= 2 && smallestRetainedSuite >= 3
        ? "Moderate"
        : "Limited";

  const difficultyLedger = new Map<string, { correct: number; total: number }>();
  for (const submission of evidence.submissions) {
    const task = asRecord(submission.task);
    const difficulty = titleize(String(task.difficulty || "Unspecified"));
    const current = difficultyLedger.get(difficulty) ?? { correct: 0, total: 0 };
    current.total += submission.totalCount;
    current.correct += submission.passedCount;
    difficultyLedger.set(difficulty, current);
  }
  const difficultyBreakdown = Array.from(difficultyLedger.entries()).map(([name, { correct, total }]) => ({
    name,
    score: total ? Math.round((correct / total) * 100) : 0,
    total,
  }));

  const fullyPassedTasks = evidence.submissions.filter(
    (s) => s.totalCount > 0 && s.passedCount === s.totalCount,
  ).length;
  const sqlStrengths: string[] = [];
  const sqlRisks: string[] = [];
  if (evidence.submissions.length > 0) {
    if (fullyPassedTasks === evidence.submissions.length) {
      sqlStrengths.push("Passed every retained test case across all submitted tasks.");
    } else if (fullyPassedTasks > 0) {
      sqlStrengths.push(`Fully passed ${fullyPassedTasks} of ${evidence.submissions.length} tasks.`);
    }
    for (const { name, score, total } of difficultyBreakdown) {
      if (total === 0) continue;
      if (score <= 40) sqlRisks.push(`Weak on ${name} tasks (${score}% of retained cases passed).`);
      else if (score >= 90) sqlStrengths.push(`Strong on ${name} tasks (${score}% of retained cases passed).`);
    }
    if (sqlRisks.length === 0 && fullyPassedTasks < evidence.submissions.length) {
      sqlRisks.push("Some retained test cases still failed — review the specific failing rows below.");
    }
  }

  return (
    <div className="space-y-5">
      <CandidateFeedbackHeader
        title={audience === "candidate" ? "Your SQL feedback" : "SQL evidence report"}
        score={`${evidence.score ?? "—"}/100`}
        summary={
          audience === "candidate"
            ? testCoverage === "Limited"
              ? "Use the query feedback below for practice, and test your solutions against more schemas and edge cases."
              : "Review each submitted query, the tests it passed, and the areas to practice next."
            : testCoverage === "Limited"
              ? `This SQL result covers ${evidence.submissions.length} task${evidence.submissions.length === 1 ? "" : "s"}, with as few as ${smallestRetainedSuite} retained judge cases per task. Use the query feedback for coaching, but do not treat the score as broad schema and edge-case coverage.`
              : "A query-by-query view of the retained SQL work. Passing judge cases is bounded execution evidence; it is not a claim that every schema or production edge case was tested."
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Score" value={evidence.score ?? "—"} detail={audience === "candidate" ? "Out of 100" : "Canonical /100 workspace result"} />
        <Metric label="Tests passed" value={`${evidence.passedCount ?? "—"}/${evidence.totalCount ?? "—"}`} detail={audience === "candidate" ? "Across your submitted queries" : "Aggregate persisted judge outcomes, not task count"} />
        <Metric label={audience === "candidate" ? "Feedback confidence" : "Evidence confidence"} value={testCoverage} detail={audience === "candidate" ? `${evidence.submissions.length} submitted task${evidence.submissions.length === 1 ? "" : "s"}` : `${evidence.submissions.length} task${evidence.submissions.length === 1 ? "" : "s"}; smallest retained suite: ${smallestRetainedSuite} cases`} />
        <Metric label="Time used" value={`${Math.round(evidence.timeTakenSeconds / 60)} min`} detail={audience === "candidate" ? "Total time in this round" : "From session start to finalization"} />
      </div>
      {difficultyBreakdown.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score by difficulty</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {difficultyBreakdown.map((entry) => (
              <div key={entry.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm">{entry.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${entry.score}%`,
                      backgroundColor: entry.score < 60 ? "#ef4444" : entry.score < 80 ? "#f59e0b" : "#10b981",
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-medium">{entry.score}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {sqlStrengths.length > 0 || sqlRisks.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <EvidenceList title="What went well" items={sqlStrengths} empty="No clear strength pattern yet." />
          <EvidenceList title="What to improve" items={sqlRisks} empty="No material risk pattern recorded." />
        </div>
      ) : null}
      <div className="space-y-4">
        {evidence.submissions.map((submission, index) => {
          const task = asRecord(submission.task);
          const passedAllRetainedCases =
            submission.totalCount > 0 &&
            submission.passedCount === submission.totalCount;
          const taskEvidenceLabel =
            submission.totalCount >= 6
              ? audience === "candidate" ? "Broader test coverage" : "Broader sample"
              : audience === "candidate" ? "Limited test coverage" : "Limited sample";
          return (
            <Card key={submission.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardDescription>SQL task {index + 1} · {titleize(String(task.difficulty || "difficulty not recorded"))}</CardDescription>
                    <CardTitle className="mt-1 text-lg">{String(task.title || task.name || submission.taskId)}</CardTitle>
                  </div>
                  <Badge variant="outline">{submission.passedCount}/{submission.totalCount} cases · {submission.score}/100</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {task.description || task.prompt ? (
                  <p className="text-sm leading-6 text-muted-foreground">{String(task.description || task.prompt)}</p>
                ) : null}
                <div>
                  <p className="mb-2 text-sm font-semibold">Submitted query</p>
                  <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>{submission.query}</code></pre>
                </div>
                <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
                  <section>
                    <h4 className="text-sm font-semibold">{audience === "candidate" ? "Test result" : "What the judge established"}</h4>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {passedAllRetainedCases
                        ? audience === "candidate"
                          ? `Your query passed all ${submission.totalCount} automated tests for this task.`
                          : `Your query matched all ${submission.totalCount} retained cases. This confirms the expected output for this suite only.`
                        : audience === "candidate"
                          ? `Your query passed ${submission.passedCount} of ${submission.totalCount} automated tests. At least one test produced a different result.`
                          : `Your query matched ${submission.passedCount} of ${submission.totalCount} retained cases. At least one retained dataset produced a different result.`}
                    </p>
                  </section>
                  <section>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{audience === "candidate" ? "Next practice step" : "Next verification"}</h4>
                      <Badge variant="outline">{taskEvidenceLabel}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {passedAllRetainedCases
                        ? "Create one new dataset with nulls, duplicate join keys, ties, or empty groups where the schema permits them. The query should still return the columns and ordering required by the task."
                        : "Re-read the required columns, grouping, filters, tie handling, and final ordering. Change one clause at a time, then rerun until every visible case matches."}
                    </p>
                  </section>
                </div>
                {(() => {
                  const rows = parseJudgeResultRows(submission.results);
                  if (rows.length === 0) return null;
                  return (
                    <div className="border-t pt-4">
                      <p className="mb-2 text-sm font-semibold">Test case results</p>
                      <div className="space-y-2">
                        {rows.map((row, rowIndex) => (
                          <div
                            key={rowIndex}
                            className={`rounded-lg border p-3 text-xs ${row.passed ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={row.passed ? "outline" : "destructive"}>
                                {JUDGE_STATUS_LABEL[row.status] ?? row.status}
                              </Badge>
                              {!row.input ? (
                                <span className="text-muted-foreground">Hidden test case</span>
                              ) : null}
                            </div>
                            {row.input ? (
                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <div>
                                  <p className="font-medium text-muted-foreground">Input</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all">{row.input}</pre>
                                </div>
                                <div>
                                  <p className="font-medium text-muted-foreground">Expected</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all">{row.expected}</pre>
                                </div>
                                <div>
                                  <p className="font-medium text-muted-foreground">Actual</p>
                                  <pre className="mt-1 whitespace-pre-wrap break-all">{row.actual}</pre>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const AI_REPORT_BAND_STYLE: Record<string, string> = {
  strong: "bg-emerald-50 text-emerald-800 border-emerald-200",
  good: "bg-teal-50 text-teal-800 border-teal-200",
  wrong: "bg-amber-50 text-amber-800 border-amber-200",
};

function aiReportBandLabel(band: string) {
  const normalized = band.toLowerCase();
  if (normalized === "wrong") return "Needs work";
  return titleize(band || "Unrated");
}

/// A candidate-facing alternate presentation of the same persisted interview
/// artifact as the standard report above - same data, a document-style
/// layout (serif headings, warm neutral ground) some candidates read more
/// easily than the in-app card grid. Never a second source of truth: every
/// number and quote here comes from the identical `report` object.
function AIReportDocument({
  candidateName,
  targetRole,
  score,
  band,
  reasoningSummary,
  verdictSummary,
  dimensions,
  strengths,
  risks,
  deliverySummary,
  deliverySignal,
  ownershipSummary,
  ownershipSignal,
  coverageNote,
  testedDimensionLabels,
  untestedDimensionLabels,
  questions,
  sevenDayPlan,
  thirtyDayPlan,
  reportHash,
}: {
  candidateName: string;
  targetRole: string;
  score: number;
  band: string;
  reasoningSummary: string;
  verdictSummary: string;
  dimensions: [string, number][];
  strengths: string[];
  risks: string[];
  deliverySummary: string;
  deliverySignal: string;
  ownershipSummary: string;
  ownershipSignal: string;
  coverageNote: string;
  testedDimensionLabels: string[];
  untestedDimensionLabels: string[];
  questions: Json[];
  sevenDayPlan: string[];
  thirtyDayPlan: string[];
  reportHash: string;
}) {
  return (
    <div className="rounded-2xl border border-[#DDD6C4] bg-[#F5F3EE] p-5 text-[#1D2624] shadow-sm md:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-4 border-b border-[#DDD6C4] pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-[#8A9490]">
              Placement Readiness Interview · AI Report
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-[#1D2624]">{candidateName}</h1>
            <p className="mt-1 text-sm text-[#5B655F]">{targetRole}</p>
          </div>
          <div className="text-left sm:text-right">
            <div className="font-serif text-4xl font-semibold leading-none text-[#163B36]">
              {score}
              <span className="text-lg font-normal text-[#8A9490]">/100</span>
            </div>
            <div className="mt-2 inline-block rounded-full bg-[#E1EDE9] px-3 py-1 text-xs font-semibold text-[#163B36]">
              {titleize(band)}
            </div>
          </div>
        </header>

        <section className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-[#8A9490]">Executive summary</p>
          <p className="text-[1.0625rem] leading-relaxed text-[#1D2624]">{reasoningSummary}</p>
          <div className="mt-3 rounded-md border border-[#DDD6C4] border-l-[3px] border-l-[#245952] bg-white p-4 text-sm leading-relaxed shadow-sm">
            <span className="font-semibold text-[#163B36]">Readiness verdict —</span> {verdictSummary}
          </div>
        </section>

        <section className="mt-8">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em] text-[#8A9490]">Dimension scores</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {dimensions.map(([name, value]) => (
              <div key={name}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-[#5B655F]">{name}</span>
                  <span className="font-semibold tabular-nums">{value}</span>
                </div>
                <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-[#ECE8DD]">
                  <div className="h-full rounded-full bg-[#245952]" style={{ width: `${Math.min(100, value)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-800">Strongest converting signals</h3>
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-[#1D2624]">
              {strengths.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
          <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">Avoidable rejection risks</h3>
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-[#1D2624]">
              {risks.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[10px] border border-[#DDD6C4] bg-white p-4 text-sm shadow-sm">
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#8A9490]">Delivery read</h3>
            <p>{deliverySummary}</p>
            <p className="mt-1 text-[#5B655F]">{deliverySignal}</p>
          </div>
          <div className="rounded-[10px] border border-[#DDD6C4] bg-white p-4 text-sm shadow-sm">
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#8A9490]">Project ownership read</h3>
            <p>{ownershipSummary}</p>
            <p className="mt-1 text-[#5B655F]">{ownershipSignal}</p>
          </div>
        </section>

        <section className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-[#8A9490]">Coverage &amp; confidence</p>
          <div className="rounded-md border border-[#DDD6C4] border-l-[3px] border-l-[#8A9490] bg-white p-4 text-sm leading-relaxed shadow-sm">
            {coverageNote} Tested in depth: {testedDimensionLabels.join(", ") || "none recorded"}.
            {untestedDimensionLabels.length ? ` ${untestedDimensionLabels.join(", ")} ${untestedDimensionLabels.length === 1 ? "was" : "were"} not directly tested this session.` : ""}
          </div>
        </section>

        <section className="mt-8">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.09em] text-[#8A9490]">
            Full interview review · {questions.length} exchange{questions.length === 1 ? "" : "s"}
          </p>
          <div className="space-y-3">
            {questions.map((question, index) => {
              const band = String(question.answerBand || "").toLowerCase();
              return (
                <div key={String(question.slotId || index) + index} className="rounded-[10px] border border-[#DDD6C4] bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8A9490]">{String(question.slotLabel || `Question ${index + 1}`)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${AI_REPORT_BAND_STYLE[band] || "bg-slate-50 text-slate-700 border-slate-200"}`}>
                      {aiReportBandLabel(band)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.9375rem] font-semibold text-[#1D2624]">{String(question.questionText || "")}</p>
                  <p className="mt-1.5 border-l-2 border-[#DDD6C4] pl-3 text-sm italic text-[#5B655F]">&ldquo;{String(question.answerSummary || "")}&rdquo;</p>
                  <div className="mt-3 grid gap-3 border-t border-[#ECE8DD] pt-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#8A9490]">What was good</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-[#5B655F]">
                        {strings(question.whatWasGood).map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#8A9490]">A stronger answer would</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-[#5B655F]">
                        {strings(question.strongerAnswerWouldInclude).map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[10px] border border-[#DDD6C4] bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-serif text-base font-semibold text-[#163B36]">7-day plan</h3>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-[#1D2624]">
              {sevenDayPlan.map((item, i) => <li key={i}>{item}</li>)}
            </ol>
          </div>
          <div className="rounded-[10px] border border-[#DDD6C4] bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-serif text-base font-semibold text-[#163B36]">30-day plan</h3>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-[#1D2624]">
              {thirtyDayPlan.map((item, i) => <li key={i}>{item}</li>)}
            </ol>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-[#DDD6C4] pt-4 text-xs text-[#8A9490]">
          <span>ProvenHire Placement Readiness · schema placement.callback.v1</span>
          {reportHash ? <span className="font-mono">report_hash {reportHash.slice(0, 12)}…</span> : null}
        </footer>
      </div>
    </div>
  );
}

function PlacementReadinessReport({
  dossier,
  audience = "admin",
}: {
  dossier: WorkspaceCandidateDossier;
  audience?: ReportAudience;
}) {
  const [viewMode, setViewMode] = useState<"standard" | "ai-report">("standard");
  const interviewModule = dossier.modules.interview;
  if (!interviewModule) {
    return <AntigravityReport dossier={dossier} audience={audience} />;
  }
  const latest = interviewModule.latest;
  if (!latest && interviewModule.legacyAntigravity) {
    return <AntigravityReport dossier={dossier} audience={audience} />;
  }
  if (!latest) {
    const status = interviewModule.status;
    return status === "started" || status === "processing" ? (
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="flex items-start gap-3 p-6 text-amber-950">
          <Loader2 className="mt-0.5 h-5 w-5 animate-spin" />
          <div><p className="font-semibold">Preparing your interview feedback</p><p className="mt-1 text-sm">Your interview is saved. Detailed feedback is usually ready within five minutes. You can safely return to your assessment and check again later.</p></div>
        </CardContent>
      </Card>
    ) : status === "failed" ? (
      <Card className="border-rose-300 bg-rose-50">
        <CardContent className="flex items-start gap-3 p-6 text-rose-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">We could not prepare your feedback yet</p>
            <p className="mt-1 text-sm leading-6">
              Your interview is saved, and you do not need to retake it. Check again later or contact the organizer if this message remains.
            </p>
          </div>
        </CardContent>
      </Card>
    ) : (
      <MissingModule
        name="Placement Readiness"
        message="Complete the interview to unlock your detailed readiness report."
      />
    );
  }
  const report = asRecord(latest.report);
  const scorecard = asRecord(report.scorecard);
  const verdict = asRecord(report.readinessVerdict);
  const delivery = asRecord(report.deliveryRead);
  const ownership = asRecord(report.projectOwnershipRead);
  const questions = asList(report.questionReviews).map(asRecord);
  const dimensions = asRecord(scorecard.dimensionScores);
  const coverage = asRecord(report.coverageSummary);
  const testedSlots = strings(coverage.testedSlots);
  const lightlyTestedSlots = strings(coverage.lightlyTestedSlots);
  const testedDimensions = strings(coverage.testedDimensions);
  const interviewConfidence =
    testedSlots.length >= 6 && testedDimensions.length >= 4
      ? "High"
      : testedSlots.length >= 3 && testedDimensions.length >= 2
        ? "Moderate"
        : "Limited";
  const readinessDetail =
    interviewConfidence === "Limited"
      ? "Readiness band withheld until coverage improves"
      : titleize(String(scorecard.readinessBand || "readiness band unavailable"));

  const reportUrlForAudience = audience === "candidate" ? latest.candidateReportUrl : latest.reportUrl;
  const viewToggle = (
    <div className="inline-flex rounded-lg border p-1">
      <button
        type="button"
        onClick={() => setViewMode("standard")}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "standard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        Standard view
      </button>
      <button
        type="button"
        onClick={() => setViewMode("ai-report")}
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "ai-report" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        AI Report
      </button>
      {reportUrlForAudience ? (
        <a
          href={reportUrlForAudience}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Full report <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );

  if (viewMode === "ai-report" && interviewConfidence !== "Limited") {
    return (
      <div className="space-y-4">
        {viewToggle}
        <AIReportDocument
          candidateName={String(
            dossier.candidate.jobSeekerProfile?.fullName ||
              dossier.candidate.name ||
              dossier.candidate.email,
          )}
          targetRole={String(dossier.synthesis?.roleRubric?.targetRole || "")}
          score={numeric(latest.score ?? scorecard.overallScore, 0)}
          band={String(scorecard.readinessBand || "")}
          reasoningSummary={String(scorecard.reasoningSummary || "")}
          verdictSummary={String(verdict.summary || "")}
          dimensions={Object.entries(dimensions)
            .filter(([, value]) => Number.isFinite(Number(value)))
            .map(([key, value]) => [titleize(key), numeric(value)] as [string, number])}
          strengths={strings(report.strongestConvertingSignals)}
          risks={strings(report.avoidableRejectionRisks)}
          deliverySummary={String(delivery.summary || "")}
          deliverySignal={String(delivery.pressureHandlingSignal || "")}
          ownershipSummary={String(ownership.summary || "")}
          ownershipSignal={String(ownership.authenticitySignal || "")}
          coverageNote={String(coverage.confidenceNote || "")}
          testedDimensionLabels={testedDimensions.map(titleize)}
          untestedDimensionLabels={Object.keys(dimensions)
            .filter((key) => !testedDimensions.includes(key))
            .map(titleize)}
          questions={questions}
          sevenDayPlan={strings(report.sevenDayPlan)}
          thirtyDayPlan={strings(report.thirtyDayPlan)}
          reportHash={String(latest.reportHash || "")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {viewToggle}
      <CandidateFeedbackHeader
        title={audience === "candidate" ? "Your AI interview feedback" : "Placement Readiness evidence report"}
        score={`${latest.score ?? scorecard.overallScore ?? "—"}/100`}
        summary={
          interviewConfidence === "Limited"
            ? `This is a preliminary coaching read. Only ${testedSlots.length} interview slots were fully tested, so the score and dimensions must not be treated as a complete readiness classification.`
            : String(
                verdict.summary ||
                  scorecard.reasoningSummary ||
                  (audience === "candidate"
                    ? "Your detailed interview feedback is ready."
                    : "The persisted interview artifact is ready for review."),
              )
        }
      />
      {interviewConfidence === "Limited" ? (
        <Card className="border-amber-300 bg-amber-50 text-amber-950">
          <CardContent className="flex items-start gap-3 p-5">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Coverage is too thin for a readiness label</p>
              <p className="mt-1 text-sm leading-6">The detailed observations remain visible for coaching. Complete more structured slots before using the scorecard as a readiness signal.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Overall score" value={latest.score ?? numeric(scorecard.overallScore, 0)} detail={readinessDetail} />
        <Metric label="Fully tested slots" value={testedSlots.length} detail={`${lightlyTestedSlots.length} additional slots were lightly tested`} />
        <Metric label={audience === "candidate" ? "Feedback confidence" : "Evidence confidence"} value={interviewConfidence} detail={String(coverage.confidenceNote || (audience === "candidate" ? "Based on the topics covered in your interview" : "Coverage note was not retained"))} />
        <Metric label="Validation" value={asRecord(report.validationSummary).validationPassed === true ? "Passed" : "Review"} detail={audience === "candidate" ? "Feedback quality check" : `Session ${latest.sessionId}`} />
      </div>
      <Card><CardHeader><CardTitle className="text-base">Readiness dimensions</CardTitle></CardHeader><CardContent><ScoreBreakdown values={dimensions} /></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <EvidenceList title="Strongest converting signals" items={strings(report.strongestConvertingSignals)} />
        <EvidenceList title={audience === "candidate" ? "Priority improvements" : "Avoidable rejection risks"} items={strings(report.avoidableRejectionRisks)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Communication and delivery</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6"><p>{String(delivery.summary || "No delivery summary retained.")}</p><p className="text-muted-foreground">{String(delivery.pressureHandlingSignal || "")}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Project ownership</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6"><p>{String(ownership.summary || "No ownership summary retained.")}</p><p className="text-muted-foreground">{String(ownership.authenticitySignal || "")}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Question-by-question review</CardTitle><CardDescription>What was demonstrated, what was missing, and what a stronger answer would include.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {questions.length ? questions.map((question, index) => (
            <div key={String(question.slotId || index)} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{String(question.slotLabel || `Question ${index + 1}`)}</p><Badge variant="outline">{titleize(String(question.answerBand || "unrated"))}</Badge></div>
              <p className="mt-2 text-sm leading-6">{String(question.questionText || "Question text unavailable")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{String(question.answerSummary || "")}</p>
              <div className="mt-4 grid gap-5 border-t pt-4 md:grid-cols-2">
                <section>
                  <h4 className="mb-2 text-sm font-semibold">Demonstrated</h4>
                  <EvidenceItems items={strings(question.whatWasGood)} />
                </section>
                <section>
                  <h4 className="mb-2 text-sm font-semibold">Stronger answer</h4>
                  <EvidenceItems items={strings(question.strongerAnswerWouldInclude)} />
                </section>
              </div>
            </div>
          )) : <p className="text-sm text-muted-foreground">No question-level review was retained.</p>}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2"><EvidenceList title="7-day plan" items={strings(report.sevenDayPlan)} /><EvidenceList title="30-day plan" items={strings(report.thirtyDayPlan)} /></div>
    </div>
  );
}

function MissingModule({
  name,
  message,
}: {
  name: string;
  message?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-6">
        <ShieldAlert className="h-5 w-5 text-amber-600" />
        <div>
          <p className="font-semibold">{name} report unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {message ||
              "This candidate has no persisted completed result for this module."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkspaceCandidateReportsPage() {
  const { id, userId, code } = useParams<{
    id: string;
    userId: string;
    code: string;
  }>();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("module") as ModuleKey | null;
  const requestedModule: ModuleKey = [
    "overview",
    "aptitude",
    "dsa",
    "sql",
    "interview",
    "antigravity",
  ].includes(requested || "")
    ? requested!
    : "overview";
  const selfService = Boolean(code);
  const audience: ReportAudience = selfService
    ? "candidate"
    : searchParams.get("audience") === "candidate"
      ? "candidate"
      : "admin";
  const [dossier, setDossier] = useState<WorkspaceCandidateDossier | null>(
    null,
  );
  const [error, setError] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [generationNotice, setGenerationNotice] = useState("");
  const [queuedReport, setQueuedReport] = useState<QueuedReport | null>(null);
  const [decisionError, setDecisionError] = useState("");
  const [recordingDecision, setRecordingDecision] = useState(false);
  const [generatingReport, setGeneratingReport] = useState<
    "dsa" | "unified" | null
  >(null);
  const local = import.meta.env.DEV && (!id || id === localWorkspaceId);
  const candidateExperience = selfService || (local && audience === "candidate");

  useEffect(() => {
    if (selfService && code) {
      api
        .get<{ dossier: WorkspaceCandidateDossier }>(
          `/api/user/workspaces/code/${encodeURIComponent(code)}/my-dossier`,
        )
        .then((response) => {
          setDossier(response.dossier);
          setError("");
        })
        .catch((reason) =>
          setError(
            reason instanceof Error
              ? reason.message
              : "Failed to load your workspace feedback",
          ),
        );
      return;
    }
    if (!userId) return;
    if (local) {
      setDossier(preview.dossiers[userId] ?? null);
      setError(
        preview.dossiers[userId] ? "" : "Local preview candidate not found.",
      );
      return;
    }
    if (!id) return;
    api
      .get<{ dossier: WorkspaceCandidateDossier }>(
        `/api/workspaces/${id}/registrations/${userId}/dossier`,
      )
      .then((response) => setDossier(response.dossier))
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Failed to load candidate reports",
        ),
      );
  }, [id, userId, local, selfService, code]);

  const waitingForPlacementReport = Boolean(
    selfService &&
      code &&
      !dossier?.modules.interview?.latest &&
      ["started", "processing"].includes(
        dossier?.modules.interview?.status || "",
      ),
  );

  useEffect(() => {
    if (!waitingForPlacementReport || !code) return;
    const timer = window.setInterval(() => {
      void api
        .get<{ dossier: WorkspaceCandidateDossier }>(
          `/api/user/workspaces/code/${encodeURIComponent(code)}/my-dossier`,
        )
        .then((response) => {
          setDossier(response.dossier);
          setError("");
        })
        .catch(() => {
          // Keep the persisted report-processing state visible during transient polling errors.
        });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [code, waitingForPlacementReport]);

  useEffect(() => {
    if (!queuedReport || local || !id || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await api.get<{ dossier: WorkspaceCandidateDossier }>(
          `/api/workspaces/${id}/registrations/${userId}/dossier`,
        );
        if (cancelled) return;
        setDossier(response.dossier);
        const completedAt =
          response.dossier.agentReports?.[queuedReport.kind]?.completedAt ??
          null;
        if (
          completedAt &&
          completedAt !== queuedReport.baselineCompletedAt
        ) {
          setQueuedReport(null);
          setGenerationNotice(
            `${queuedReport.kind === "dsa" ? "DSA" : "Unified"} reasoning report is ready.`,
          );
        }
      } catch {
        // The durable job continues if one polling request fails.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    const deadline = window.setTimeout(() => {
      if (cancelled) return;
      setQueuedReport(null);
      setGenerationNotice(
        "The report is still processing. You can leave this page and return to the workspace within five minutes.",
      );
    }, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(deadline);
    };
  }, [id, local, queuedReport, userId]);

  async function generateReport(kind: "dsa" | "unified") {
    if (local || !id || !userId) return;
    setGeneratingReport(kind);
    setGenerationError("");
    setGenerationNotice("");
    try {
      const baselineCompletedAt =
        dossier?.agentReports?.[kind]?.completedAt ?? null;
      const response = await api.post<{
        generation?: AgentGeneration;
        queued?: boolean;
      }>(
        `/api/workspaces/${id}/registrations/${userId}/reports/generate`,
        { kind, force: true },
      );
      if (response.generation) {
        setDossier((current) =>
          current
            ? {
                ...current,
                agentReports: {
                  dsa: current.agentReports?.dsa ?? null,
                  unified: current.agentReports?.unified ?? null,
                  [kind]: response.generation!,
                },
              }
            : current,
        );
      } else if (response.queued) {
        setQueuedReport({ kind, baselineCompletedAt });
        setGenerationNotice(
          "Report generation has started in the background. You can leave this page; the report will appear in this workspace within five minutes.",
        );
      }
    } catch (reason) {
      setGenerationError(
        reason instanceof Error ? reason.message : "Report generation failed",
      );
    } finally {
      setGeneratingReport(null);
    }
  }

  async function recordDecision(payload: DecisionPayload) {
    if (local || !id || !userId) return;
    setRecordingDecision(true);
    setDecisionError("");
    try {
      const response = await api.put<{
        decision: NonNullable<WorkspaceCandidateDossier["recordedDecision"]>;
      }>(`/api/workspaces/${id}/registrations/${userId}/decision`, payload);
      setDossier((current) =>
        current ? { ...current, recordedDecision: response.decision } : current,
      );
    } catch (reason) {
      setDecisionError(
        reason instanceof Error ? reason.message : "Decision recording failed",
      );
    } finally {
      setRecordingDecision(false);
    }
  }

  const candidateName = useMemo(
    () =>
      dossier?.candidate.jobSeekerProfile?.fullName ||
      dossier?.candidate.name ||
      "Candidate",
    [dossier],
  );
  if (!dossier && !error) {
    if (!selfService) return <PageLoaderFullScreen />;
    return (
      <UserWorkspaceShell>
        <div className="workspace-dashboard-page flex min-h-[420px] items-center justify-center">
          <div className="flex items-center gap-3 text-[var(--dash-text-muted)]">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--dash-gold)]" />
            Loading your assessment reports…
          </div>
        </div>
      </UserWorkspaceShell>
    );
  }
  if (!dossier) {
    const errorCard = (
      <div className={selfService ? "workspace-dashboard-page" : "p-8"}>
        <Card className="mx-auto max-w-xl border-rose-300 bg-rose-50">
          <CardContent className="p-6 text-rose-950">{error}</CardContent>
        </Card>
      </div>
    );
    return selfService ? (
      <UserWorkspaceShell>{errorCard}</UserWorkspaceShell>
    ) : (
      <main className="min-h-screen bg-muted/30">{errorCard}</main>
    );
  }
  const backHref = selfService
    ? `/dashboard/jobseeker/workspaces/${encodeURIComponent(code || "")}`
    : local
      ? "/local-preview/workspace"
      : `/admin/workspaces/${id}`;
  const baseHref = selfService
    ? `/dashboard/jobseeker/workspaces/${encodeURIComponent(code || "")}/reports`
    : local
      ? `/local-preview/workspace/candidates/${userId}/reports`
      : `/admin/workspaces/${id}/candidates/${userId}/reports`;
  const configuredModules = new Set(
    dossier.synthesis?.requiredModules ??
      dossier.registration.roundAttempts.map((attempt) =>
        ({
          mcq: "aptitude",
          coding: "dsa",
          sql: "sql",
          interview: "interview",
        })[attempt.roundType],
      ),
  );
  const modules: Array<{ key: ModuleKey; label: string; icon: typeof Target }> =
    [
      { key: "overview", label: audience === "candidate" ? "Overview" : "Review summary", icon: Target },
      ...(configuredModules.has("aptitude") || dossier.modules.aptitude.workspaceEvidence
        ? [{ key: "aptitude" as const, label: "Aptitude", icon: BrainCircuit }]
        : []),
      ...(configuredModules.has("dsa") || dossier.modules.dsa.workspaceEvidence
        ? [{ key: "dsa" as const, label: "Coding", icon: Code2 }]
        : []),
      ...(configuredModules.has("sql") || dossier.modules.sql.workspaceEvidence
        ? [{ key: "sql" as const, label: "SQL", icon: Database }]
        : []),
      ...(configuredModules.has("interview") ||
      dossier.modules.interview.latest ||
      dossier.modules.interview.legacyAntigravity
        ? [{ key: "interview" as const, label: "AI interview", icon: RadioTower }]
        : []),
      ...(audience === "admin" && dossier.modules.antigravity.latest
        ? [{ key: "antigravity" as const, label: "Antigravity archive", icon: RadioTower }]
        : []),
    ];
  const module = modules.some((item) => item.key === requestedModule)
    ? requestedModule
    : "overview";
  const requiredResultCount =
    dossier.synthesis?.requiredModules?.length || configuredModules.size;
  const auditableResultCount = Array.from(configuredModules).filter((key) =>
    key === "aptitude" || key === "dsa" || key === "sql" || key === "interview"
      ? evidenceComplete(dossier, key)
      : false,
  ).length;

  const reportContent = (
      <div
        className={
          candidateExperience
            ? "workspace-dashboard-page workspace-report-page space-y-5"
            : "mx-auto min-w-0 max-w-7xl space-y-5"
        }
      >
        {local ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {candidateExperience
                ? "Candidate preview: this is the same navigation and wording a signed-in candidate sees."
                : "Local preview: production-shaped data without authentication or database writes."}
            </span>
            {candidateExperience && !selfService ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`${baseHref}?module=${module}&audience=admin`}>
                  Return to reviewer view
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {decisionError ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {decisionError}
          </div>
        ) : null}
        <header
          className={
            candidateExperience
              ? "dashboard-hero-card p-5 md:p-7"
              : "rounded-xl border bg-background p-5 shadow-sm md:p-7"
          }
        >
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
            <Link to={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to assessment
            </Link>
          </Button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">
                {candidateExperience ? "Results and feedback" : "Candidate review"}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                {candidateExperience ? "Your assessment results" : candidateName}
              </h1>
              <p className="mt-2 break-words text-muted-foreground">
                {candidateExperience
                  ? `${code ? `Assessment code ${code} · ` : ""}`
                  : `${dossier.candidate.email} · `}
                {dossier.synthesis?.roleRubric?.targetRole ||
                  "Employer target role not recorded"}
              </p>
            </div>
            <Badge variant="outline" className="px-3 py-1.5">
              {auditableResultCount}/{requiredResultCount} detailed results ready
            </Badge>
          </div>
        </header>
        {!candidateExperience ? (
          <section
            className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-2"
            aria-label="Report audience"
          >
            <Button
              asChild
              size="lg"
              variant={audience === "admin" ? "default" : "outline"}
              className="h-auto min-w-0 justify-start whitespace-normal py-4"
            >
              <Link to={`${baseHref}?module=${module}&audience=admin`}>
                <BriefcaseBusiness className="mr-3 h-5 w-5" />
                <span className="min-w-0 text-left">
                  <span className="block font-bold">Reviewer evidence</span>
                  <span className="block text-xs font-normal opacity-80">
                    Evidence gates, contradictions, risk, and panel action
                  </span>
                </span>
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant={audience === "candidate" ? "default" : "outline"}
              className="h-auto min-w-0 justify-start whitespace-normal py-4"
            >
              <Link to={`${baseHref}?module=${module}&audience=candidate`}>
                <GraduationCap className="mr-3 h-5 w-5" />
                <span className="min-w-0 text-left">
                  <span className="block font-bold">
                    Preview candidate feedback
                  </span>
                  <span className="block text-xs font-normal opacity-80">
                    Strengths, mistakes, coaching, and practice plan
                  </span>
                </span>
              </Link>
            </Button>
          </section>
        ) : null}
        <nav
          className="flex flex-wrap gap-2 rounded-xl border bg-background p-2"
          aria-label="Candidate report modules"
        >
          {modules.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              asChild
              variant={module === key ? "default" : "ghost"}
              className="min-w-[10rem] flex-1 justify-start whitespace-normal"
            >
              <Link to={`${baseHref}?module=${key}&audience=${audience}`}>
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
        </nav>
        {generationError ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {generationError}
          </div>
        ) : null}
        {generationNotice ? (
          <div
            className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950"
            role="status"
          >
            {queuedReport ? (
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 inline h-4 w-4" />
            )}
            {generationNotice}
          </div>
        ) : null}
        {audience === "candidate" ? (
          module === "overview" ? (
            <CandidateOverview dossier={dossier} />
          ) : module === "aptitude" ? (
            <CandidateAptitudeReport dossier={dossier} />
          ) : module === "dsa" ? (
            <CandidateDsaReport dossier={dossier} />
          ) : module === "sql" ? (
            <SqlReport dossier={dossier} audience="candidate" />
          ) : module === "antigravity" ? (
            <AntigravityReport dossier={dossier} audience="candidate" />
          ) : (
            <PlacementReadinessReport dossier={dossier} audience="candidate" />
          )
        ) : module === "overview" ? (
          <Overview
            dossier={dossier}
            generating={
              generatingReport === "unified" ||
              queuedReport?.kind === "unified"
            }
            onGenerate={local ? undefined : () => generateReport("unified")}
            onRecordDecision={local ? undefined : recordDecision}
            recordingDecision={recordingDecision}
          />
        ) : module === "aptitude" ? (
          <AptitudeReport dossier={dossier} />
        ) : module === "dsa" ? (
          <DsaReport
            dossier={dossier}
            generating={
              generatingReport === "dsa" || queuedReport?.kind === "dsa"
            }
            onGenerate={local ? undefined : () => generateReport("dsa")}
          />
        ) : module === "sql" ? (
          <SqlReport dossier={dossier} />
        ) : module === "antigravity" ? (
          <AntigravityReport dossier={dossier} />
        ) : (
          <PlacementReadinessReport dossier={dossier} />
        )}
      </div>
  );
  return candidateExperience ? (
    <UserWorkspaceShell>{reportContent}</UserWorkspaceShell>
  ) : (
    <main className="min-h-screen bg-muted/30 px-4 py-6 md:px-8">
      {reportContent}
    </main>
  );
}
