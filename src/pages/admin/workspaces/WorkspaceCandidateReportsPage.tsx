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
import {
  preview,
  workspaceId as localWorkspaceId,
} from "./WorkspaceLocalPreviewPage";

type ModuleKey = "overview" | "aptitude" | "dsa" | "antigravity";
type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] =>
  asList(value).map(String).filter(Boolean);
const numeric = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const titleize = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

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
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
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
        {items.length ? (
          <ul className="space-y-3 text-sm">
            {items.map((item, index) => (
              <li key={`${index}-${item}`} className="flex gap-2 leading-6">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
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
  const decision =
    kind === "unified"
      ? synthesis?.recommendation || "INSUFFICIENT EVIDENCE"
      : score == null
        ? "ASSESSMENT EVIDENCE UNAVAILABLE"
        : kind === "aptitude"
          ? "OBJECTIVE SIGNAL RECORDED"
          : "CODING EVIDENCE RECORDED";
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
          `${score ?? "—"}/100 persisted score`,
          `${String(aptitudeAnswers.correct ?? "—")} correct responses`,
          aptitudeReview.length === aptitudeTotal && aptitudeTotal > 0
            ? `All ${aptitudeTotal} question records retained`
            : `${aptitudeReview.length}/${aptitudeTotal || "?"} question records retained`,
        ]
      : kind === "dsa"
        ? [
            `${score ?? "—"}/100 persisted score`,
            `${fullyPassed}/${dsaSubmissions.length} submissions passed every retained test`,
            "Source and retained judge evidence are inspectable below",
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
      : "This module is one input to a human review. It does not independently approve or reject the candidate.";
  return (
    <Card className="overflow-hidden border-slate-800 shadow-lg">
      <CardContent className="bg-slate-950 p-6 text-white md:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
            {kind === "unified"
              ? "Decision-support status"
              : `${kind} assessment status`}
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
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
              <p className="text-xs font-bold text-violet-300">
                EVIDENCE {index + 1}
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
    <Card className="overflow-hidden border-indigo-300 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-indigo-950 via-slate-950 to-violet-950 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardDescription className="text-indigo-200">
              AI evidence interpretation · advisory, persisted, source-hashed
            </CardDescription>
            <CardTitle className="mt-2 flex items-center gap-2 text-2xl">
              <Sparkles className="h-6 w-6 text-violet-300" />
              {title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/10 text-white hover:bg-white/10">
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
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">
            Evidence interpretation
          </p>
          <p className="mt-3 text-base leading-8">
            {String(result.executiveRead || "No executive read was returned.")}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            This narrative cannot create missing evidence, assign a hiring
            outcome, or replace a named reviewer applying the employer rubric.
          </p>
        </section>
        {result.crossModuleThesis || result.algorithmicReasoning ? (
          <section className="rounded-xl bg-indigo-50 p-4">
            <p className="font-semibold text-indigo-950">Reasoning thesis</p>
            <p className="mt-2 text-sm leading-7 text-indigo-950/80">
              {String(result.crossModuleThesis || result.algorithmicReasoning)}
            </p>
          </section>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Evidence-backed strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {strengths.length ? (
                strengths.map((item, index) => (
                  <div key={index} className="rounded-lg border p-3">
                    <p className="font-medium">{String(item.claim)}</p>
                    <ul className="mt-2 list-inside list-disc text-xs leading-5 text-muted-foreground">
                      {strings(item.evidence).map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No verified strength claim returned.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Contradictions and risks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {concerns.length ? (
                concerns.map((item, index) => (
                  <div key={index} className="rounded-lg border p-3">
                    <p className="font-medium">{String(item.claim)}</p>
                    <ul className="mt-2 list-inside list-disc text-xs leading-5 text-muted-foreground">
                      {strings(item.evidence).map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No material contradiction returned.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <EvidenceList
            title="Ready now"
            items={strings(role.readyFor ?? role.readyNow)}
          />
          <EvidenceList
            title="Conditional / support"
            items={strings(role.needsSupportFor ?? role.conditional)}
          />
          <EvidenceList
            title="Not yet proven"
            items={strings(role.avoidUntilVerified ?? role.notYetProven)}
          />
        </div>
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
    DecisionPayload["rubricAssessments"]
  >(() =>
    responsibilities.map((responsibility) => ({
      responsibility,
      rating: "partial",
      rationale: "",
      evidenceRefs: [],
    })),
  );
  const gatesReady =
    dossier.synthesis?.integrity?.status === "verified" &&
    dossier.synthesis.completedModules === 3 &&
    responsibilities.length >= 3;
  const complete =
    rationale.trim().length >= 30 &&
    assessments.length === responsibilities.length &&
    assessments.every(
      (item) =>
        item.rationale.trim().length >= 10 && item.evidenceRefs.length > 0,
    );

  const updateAssessment = (
    index: number,
    patch: Partial<DecisionPayload["rubricAssessments"][number]>,
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
            Decision entry remains locked until evidence binding, all three
            modules, and the employer role rubric are complete.
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
                      onValueChange={(rating: DecisionRating) =>
                        updateAssessment(index, { rating })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
                  rubricAssessments: assessments,
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
      <AgentReasoningReport
        title="Unified candidate reasoning report"
        report={dossier.agentReports?.unified}
        generating={generating}
        onGenerate={onGenerate}
      />
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
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Aptitude"
          value={synthesis.evidenceBasis.aptitudeScore ?? "—"}
          detail="Comprehension and structured problem solving"
        />
        <Metric
          label="DSA"
          value={synthesis.evidenceBasis.dsaScore ?? "—"}
          detail="Objective coding and test performance"
        />
        <Metric
          label="Antigravity"
          value={synthesis.evidenceBasis.antigravityScore ?? "—"}
          detail={
            synthesis.evidenceBasis.antigravityVerdict ||
            "Interview reasoning evidence"
          }
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
                "Antigravity probes ownership, mechanisms, failure boundaries, and production judgment.",
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
            <strong>Calibration:</strong> the module spread is{" "}
            {synthesis.evidenceBasis.scoreSpread} points.{" "}
            {synthesis.evidenceBasis.scoreSpread <= 10
              ? "The modules broadly agree, but agreement is not a hiring rule without an employer-approved rubric."
              : "The spread is material. Resolve the contradiction directly; do not average it into a composite hiring score."}
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
              label="Score"
              value={`${latest.score ?? "—"}/100`}
              detail="Persisted assessment score"
            />
            <Metric
              label="Accuracy"
              value={`${accuracy}%`}
              detail={`${correct} correct across ${attempted} attempted`}
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
          <div className="rounded-xl border-l-4 border-l-primary bg-muted/40 p-4">
            <p className="font-semibold">Reasoning interpretation</p>
            <p className="mt-2 text-sm leading-7">
              {accuracy >= 90
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
          {categories.length ? (
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
              Legacy attempt: category-level evidence was not persisted.
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
  return (
    <div className="space-y-5">
      <AdminDecisionBanner kind="dsa" dossier={dossier} />
      <AgentReasoningReport
        title="DSA reasoning report"
        report={dossier.agentReports?.dsa}
        generating={generating}
        onGenerate={onGenerate}
      />
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
          <div className="rounded-xl border-l-4 border-l-primary bg-muted/40 p-4">
            <p className="font-semibold">Implementation interpretation</p>
            <p className="mt-2 text-sm leading-7">
              {totalTests && totalPassed === totalTests
                ? "The official submissions satisfy the complete persisted test suite. The report still exposes source, complexity claims, and follow-up reasoning because passing tests alone does not establish maintainability or conceptual depth."
                : `${totalPassed}/${totalTests || "?"} retained tests passed. At least one submission is not fully correct against the retained suite; inspect the failed case before drawing a broader implementation conclusion.`}
            </p>
          </div>
        </CardContent>
      </Card>
      {submissions.length
        ? submissions.map((submission, index) => {
            const question = submission.question;
            const resultPayload = asRecord(submission.results);
            const rows = asList(resultPayload.results).length
              ? asList(resultPayload.results).map(asRecord)
              : asList(submission.results).map(asRecord);
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
                          <details
                            key={rowIndex}
                            className="rounded-lg border px-3 py-2"
                          >
                            <summary className="cursor-pointer text-sm font-medium">
                              Test {rowIndex + 1} ·{" "}
                              {row.passed
                                ? "Passed"
                                : String(row.status || "Failed")}
                            </summary>
                            <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                              {JSON.stringify(row, null, 2)}
                            </pre>
                          </details>
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
}: {
  title: string;
  score: string;
  summary: string;
}) {
  return (
    <Card className="overflow-hidden border-emerald-300">
      <CardContent className="bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 p-6 text-white md:p-8">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
              Candidate feedback · learning and improvement
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">{title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-50/90">
              {summary}
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-6 py-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">
              Your result
            </p>
            <p className="mt-1 text-4xl font-black">{score}</p>
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
  const strengths = synthesis?.verifiedStrengths ?? [];
  const risks = synthesis?.scopedRisks ?? [];
  return (
    <div className="space-y-5">
      <CandidateFeedbackHeader
        title="Your complete assessment feedback"
        score={`${synthesis?.completedModules ?? 0}/3`}
        summary="This coaching view keeps the three assessment results separate. It shows what the retained evidence supports and converts remaining gaps into practice deliverables; it does not calculate or reveal an employer hiring outcome."
      />
      {synthesis?.integrity?.status === "blocked" ? (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="p-5 text-sm leading-7 text-rose-900">
            This feedback cannot be treated as candidate-specific until the
            report binding is corrected: {synthesis.integrity.issues.join(" ")}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Aptitude"
          value={synthesis?.evidenceBasis.aptitudeScore ?? "—"}
          detail="Structured reasoning under fixed constraints"
        />
        <Metric
          label="DSA"
          value={synthesis?.evidenceBasis.dsaScore ?? "—"}
          detail="Executable problem solving"
        />
        <Metric
          label="Interview"
          value={synthesis?.evidenceBasis.antigravityScore ?? "—"}
          detail="Reasoning and ownership under pressure"
        />
      </div>
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
      </div>
      {synthesis?.integrity?.status !== "blocked" ? (
        <Card>
          <CardHeader>
            <CardTitle>Your role-readiness map</CardTitle>
            <CardDescription>
              Use this to choose projects and interview stories that strengthen
              the missing evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <EvidenceList
              title="Ready to demonstrate"
              items={strings(role.readyNow)}
            />
            <EvidenceList
              title="Build with guidance"
              items={strings(role.conditional)}
            />
            <EvidenceList
              title="Not yet proven"
              items={strings(role.notYetProven)}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>30-day improvement plan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[
            [
              "Week 1",
              risks[0]
                ? `Deliverable: write a one-page failure timeline for “${risks[0]}” naming the invariant, failure point, recovery action, and verification test.`
                : "Deliverable: choose the weakest retained module and write the missing mechanism, failure case, and verification test.",
            ],
            [
              "Week 2",
              "Deliverable: implement the smallest runnable example that proves the mechanism under failure. Success means the failure is reproduced first and the new automated test passes after the fix.",
            ],
            [
              "Weeks 3–4",
              "Deliverable: record two three-minute mock answers using context, invariant, mechanism, trade-off, failure boundary, and personal ownership. Ask a reviewer to identify any unsupported claim.",
            ],
          ].map(([period, action]) => (
            <div key={period} className="rounded-xl border p-4">
              <Badge variant="outline">{period}</Badge>
              <p className="mt-3 text-sm leading-6">{action}</p>
            </div>
          ))}
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
  return (
    <div className="space-y-5">
      <CandidateFeedbackHeader
        title="Your Aptitude feedback"
        score={score == null ? "—" : `${score}/100`}
        summary={
          accuracy >= 85
            ? "Your reasoning accuracy is a strength. Your next improvement comes from understanding the exact wrong or skipped patterns, not from repeating the entire syllabus."
            : "Your score shows a usable baseline, but your next practice cycle should target the error patterns and time-allocation choices below."
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="Accuracy"
          value={`${accuracy}%`}
          detail={`${correct} correct across ${attempted} attempts`}
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
          detail="Compare pace with the recorded limit"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Where you are strongest</CardTitle>
          <CardDescription>
            Domains are ranked by your persisted performance—not generic advice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length ? (
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
              This attempt did not retain domain labels.
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
            issues.map((row, index) => (
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
                <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                  Practice action: solve two variations of this reasoning
                  pattern, then explain the rule you used before calculating the
                  answer.
                </p>
              </div>
            ))
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
  const answers = asRecord(latest?.answers);
  const result = asRecord(dossier.agentReports?.dsa?.result);
  const score = workspace?.score ?? latest?.score ?? null;
  const strengths = asList(result.verifiedStrengths).map(asRecord);
  const risks = asList(result.failureAndRiskAnalysis).map(asRecord);
  const problems = asList(answers.problems).map(asRecord);
  const probes = strings(result.recommendedPanelProbes);
  const candidateProbes = probes.map((probe) =>
    probe
      .replace(/^Ask the candidate to\s+/i, "Practice how to ")
      .replace(/^Introduce\s+/i, "Test your solution with "),
  );
  return (
    <div className="space-y-5">
      <CandidateFeedbackHeader
        title="Your DSA feedback"
        score={score == null ? "—" : `${score}/100`}
        summary={
          score != null && score >= 80
            ? "Your implementation signal is strong. The goal now is to close the difference between passing the retained tests and proving that your solution remains correct under edge cases, concurrency, and failure."
            : "Your implementation baseline is developing. Use the problem feedback below to separate algorithm selection, correctness, and code-quality improvements."
        }
      />
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
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Evidence: {strings(item.evidence).join(" · ")}
                  </p>
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
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Why: {strings(item.evidence).join(" · ")}
                  </p>
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
            problems.map((problem, index) => (
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
                  {String(problem.approach || "Not retained")}
                </p>
                <p className="mt-2 text-sm leading-6">
                  <strong>Complexity:</strong>{" "}
                  {String(problem.timeComplexity || "—")} time ·{" "}
                  {String(problem.spaceComplexity || "—")} space
                </p>
                <p className="mt-2 rounded-lg bg-muted/50 p-3 text-sm">
                  <strong>Evidence read:</strong>{" "}
                  {String(
                    problem.followUpRead ||
                      "No retained follow-up explanation.",
                  )}
                </p>
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <strong>Next improvement:</strong>{" "}
                  {numeric(problem.testCasesPassed) <
                  numeric(problem.testCasesTotal)
                    ? "Reproduce the failed retained test, explain the broken invariant, patch it, and add one neighboring adversarial case."
                    : "Add one adversarial case outside the retained suite and explain why the invariant still holds."}
                </p>
              </div>
            ))
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
  if (!latest) return <MissingModule name="Antigravity" />;
  const report = asRecord(latest.report);
  const coverage = asRecord(report.coverage_portrait);
  const domain = asRecord(coverage.primary_domain);
  const baseUrl = String(
    import.meta.env.VITE_ANTIGRAVITY_PUBLIC_URL || "http://localhost:3000",
  ).replace(/\/$/, "");
  const previewCaseId = String(report.preview_replay_case_id || "");
  const recruiterUrl = previewCaseId
    ? `${baseUrl}/report-preview/${encodeURIComponent(previewCaseId)}`
    : `${baseUrl}/report/${encodeURIComponent(latest.antigravitySessionId)}`;
  const candidateUrl = previewCaseId
    ? `${baseUrl}/report-preview/${encodeURIComponent(previewCaseId)}?view=candidate`
    : `${baseUrl}/report/${encodeURIComponent(latest.antigravitySessionId)}/candidate`;
  if (dossier.synthesis?.integrity?.status === "blocked") {
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
          title="Your Antigravity interview reflection"
          score={
            latest.overallScore == null ? "—" : `${latest.overallScore}/10`
          }
          summary="Your full reflection is a separate coaching experience. It explains what you proved, what remained unproven, how your answers behaved under pressure, and what to practice before your next interview."
        />
        <Card className="overflow-hidden border-emerald-300">
          <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <h3 className="text-2xl font-bold">
                Continue to your complete candidate report
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Open the reflection workspace for your personal mirror, concept
                map, interview communication feedback, evidence gaps, and 30-day
                practice plan. Employer decision labels are not part of this
                coaching view.
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
                Open my full reflection <ArrowRight className="ml-2 h-5 w-5" />
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
                The complete assessment is in Antigravity
              </Badge>
              <h2 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
                This page is the index. The full report is the decision
                workspace.
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-200">
                Open the recruiter report for the complete evidence map—not a
                longer version of this scorecard. It contains the decision
                narrative, responsibility fit, pressure trajectory, claim
                verification, evidence heat map, risks, and exact next actions.
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
                ["Decision", "Verdict, confidence, and defensibility"],
                ["Responsibilities", "Ready now, supported, and avoid"],
                ["Evidence", "Heat map, probes, claims, trajectory"],
                ["Risk", "Unresolved gaps and exact validation"],
                ["Next actions", "Panel questions and hiring workflow"],
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
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={recruiterUrl} target="_blank" rel="noreferrer">
                  Open full recruiter report{" "}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={candidateUrl} target="_blank" rel="noreferrer">
                  Open candidate reflection{" "}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Score"
            value={`${latest.overallScore ?? "—"}/10`}
            detail="Evidence-weighted interview score"
          />
          <Metric
            label="Verdict"
            value={latest.hireRecommendation || "—"}
            detail="Final evaluator recommendation"
          />
          <Metric
            label="Confidence"
            value={
              latest.confidenceScore == null
                ? "—"
                : `${Math.round(latest.confidenceScore * 100)}%`
            }
            detail="Evaluator confidence"
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
          <CardTitle className="text-base">Recruiter reasoning</CardTitle>
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

function MissingModule({ name }: { name: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-6">
        <ShieldAlert className="h-5 w-5 text-amber-600" />
        <div>
          <p className="font-semibold">{name} report unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This candidate has no persisted completed result for this module.
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
  const module: ModuleKey = [
    "overview",
    "aptitude",
    "dsa",
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
  const [decisionError, setDecisionError] = useState("");
  const [recordingDecision, setRecordingDecision] = useState(false);
  const [generatingReport, setGeneratingReport] = useState<
    "dsa" | "unified" | null
  >(null);
  const local = import.meta.env.DEV && (!id || id === localWorkspaceId);

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

  async function generateReport(kind: "dsa" | "unified") {
    if (local || !id || !userId) return;
    setGeneratingReport(kind);
    setGenerationError("");
    try {
      const response = await api.post<{ generation: AgentGeneration }>(
        `/api/workspaces/${id}/registrations/${userId}/reports/generate`,
        { kind, force: true },
      );
      setDossier((current) =>
        current
          ? {
              ...current,
              agentReports: {
                dsa: current.agentReports?.dsa ?? null,
                unified: current.agentReports?.unified ?? null,
                [kind]: response.generation,
              },
            }
          : current,
      );
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
  if (!dossier && !error) return <PageLoaderFullScreen />;
  if (!dossier)
    return (
      <main className="min-h-screen bg-muted/30 p-8">
        <Card className="mx-auto max-w-xl">
          <CardContent className="p-6 text-rose-700">{error}</CardContent>
        </Card>
      </main>
    );
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
  const modules: Array<{ key: ModuleKey; label: string; icon: typeof Target }> =
    [
      { key: "overview", label: "Unified reasoning", icon: Target },
      { key: "aptitude", label: "Aptitude report", icon: BrainCircuit },
      { key: "dsa", label: "DSA report", icon: Code2 },
      { key: "antigravity", label: "Antigravity report", icon: RadioTower },
    ];

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        {local ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Local preview mode: this uses production-shaped dossier data without
            authentication or database writes.
          </div>
        ) : null}
        {decisionError ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {decisionError}
          </div>
        ) : null}
        <header className="rounded-xl border bg-background p-5 shadow-sm md:p-7">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
            <Link to={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to workspace
            </Link>
          </Button>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Candidate assessment dossier
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                {candidateName}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {dossier.candidate.email} ·{" "}
                {dossier.synthesis?.roleRubric?.targetRole ||
                  "Employer target role not recorded"}
              </p>
            </div>
            <Badge variant="outline" className="px-3 py-1.5">
              {dossier.synthesis?.completedModules ?? 0}/3 modules complete
            </Badge>
          </div>
        </header>
        {!selfService ? (
          <section
            className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-2"
            aria-label="Report audience"
          >
            <Button
              asChild
              size="lg"
              variant={audience === "admin" ? "default" : "outline"}
              className="h-auto justify-start py-4"
            >
              <Link to={`${baseHref}?module=${module}&audience=admin`}>
                <BriefcaseBusiness className="mr-3 h-5 w-5" />
                <span className="text-left">
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
              className="h-auto justify-start py-4"
            >
              <Link to={`${baseHref}?module=${module}&audience=candidate`}>
                <GraduationCap className="mr-3 h-5 w-5" />
                <span className="text-left">
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
          className="grid gap-2 rounded-xl border bg-background p-2 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Candidate report modules"
        >
          {modules.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              asChild
              variant={module === key ? "default" : "ghost"}
              className="justify-start"
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
        {audience === "candidate" ? (
          module === "overview" ? (
            <CandidateOverview dossier={dossier} />
          ) : module === "aptitude" ? (
            <CandidateAptitudeReport dossier={dossier} />
          ) : module === "dsa" ? (
            <CandidateDsaReport dossier={dossier} />
          ) : (
            <AntigravityReport dossier={dossier} audience="candidate" />
          )
        ) : module === "overview" ? (
          <Overview
            dossier={dossier}
            generating={generatingReport === "unified"}
            onGenerate={local ? undefined : () => generateReport("unified")}
            onRecordDecision={local ? undefined : recordDecision}
            recordingDecision={recordingDecision}
          />
        ) : module === "aptitude" ? (
          <AptitudeReport dossier={dossier} />
        ) : module === "dsa" ? (
          <DsaReport
            dossier={dossier}
            generating={generatingReport === "dsa"}
            onGenerate={local ? undefined : () => generateReport("dsa")}
          />
        ) : (
          <AntigravityReport dossier={dossier} />
        )}
      </div>
    </main>
  );
}
