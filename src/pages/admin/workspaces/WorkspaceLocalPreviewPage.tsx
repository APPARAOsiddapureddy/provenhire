import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Code2, BrainCircuit, RadioTower, ShieldCheck } from "lucide-react";

import { WorkspaceRegistrationsTable } from "./WorkspaceAdminComponents";
import type { WorkspaceCandidateDossier, WorkspaceRegistration, WorkspaceRoundType } from "./types";

const now = new Date().toISOString();
export const workspaceId = "local-preview-workspace";

export const registrations: WorkspaceRegistration[] = [
  {
    id: "preview-registration-riya",
    workspaceId,
    userId: "preview-riya",
    status: "registered",
    registeredAt: now,
    user: {
      id: "preview-riya",
      email: "riya.preview@provenhire.local",
      name: "Riya Menon",
      jobSeekerProfile: { fullName: "Riya Menon", targetJobTitle: "Senior Backend Engineer", college: "Local preview fixture" },
    },
  },
  {
    id: "preview-registration-arjun",
    workspaceId,
    userId: "preview-arjun",
    status: "registered",
    registeredAt: now,
    user: {
      id: "preview-arjun",
      email: "arjun.preview@provenhire.local",
      name: "Arjun Rao",
      jobSeekerProfile: { fullName: "Arjun Rao", targetJobTitle: "Software Engineer", college: "Local preview fixture" },
    },
  },
];

const attempt = (id: string, order: number, name: string, type: WorkspaceRoundType, score: number) => ({
  id,
  roundType: type,
  status: "completed",
  score,
  percentageScore: score,
  weightedScore: score / 3,
  completedAt: now,
  workspaceRound: { id: `round-${order}`, order, name, type, scoreWeightage: 33.33 },
});

function dossierFor(registration: WorkspaceRegistration, scoreOffset = 0): WorkspaceCandidateDossier {
  const candidate = registration.user!;
  const strong = scoreOffset === 0;
  const aptitudeScore = 91 - scoreOffset;
  const dsaScore = 88 - scoreOffset;
  const antigravityScore = strong ? 91 : 74;
  const compositeScore = Math.round(((aptitudeScore + dsaScore + antigravityScore) / 3) * 10) / 10;
  return {
    schemaVersion: "workspace_candidate_dossier_v1",
    workspaceId,
    candidate,
    registration: {
      id: registration.id,
      status: registration.status,
      registeredAt: registration.registeredAt,
      roundAttempts: [
        attempt(`${registration.userId}-aptitude`, 1, "Aptitude round", "mcq", aptitudeScore),
        attempt(`${registration.userId}-dsa`, 2, "DSA round", "coding", dsaScore),
        attempt(`${registration.userId}-interview`, 3, "Antigravity interview", "interview", antigravityScore),
      ],
    },
    synthesis: {
      schemaVersion: "candidate_assessment_synthesis_v1",
      recommendation: strong ? "ADVANCE" : "ADVANCE WITH TARGETED FOLLOW-UP",
      compositeScore,
      confidence: strong ? 0.94 : 0.86,
      completedModules: 3,
      overallRead: strong
        ? `ADVANCE. The evidence-weighted composite is ${compositeScore}/100 across all three modules. Aptitude and DSA verify objective problem solving; Antigravity independently confirms mechanism-level reasoning, production judgment, and ownership under pressure.`
        : `ADVANCE WITH TARGETED FOLLOW-UP. The ${compositeScore}/100 composite is positive, but Antigravity trails the objective rounds and identifies a crash-recovery depth gap that should be validated before a final offer decision.`,
      crossModuleSignals: strong
        ? ["High aptitude and DSA scores agree on problem-solving strength.", "Antigravity verifies that objective performance transfers into production reasoning.", "All three modules are in a narrow score band, reducing single-test bias."]
        : ["Aptitude and DSA support solid baseline problem solving.", "Interview communication and honest uncertainty handling are positive role signals."],
      contradictions: strong
        ? ["No material cross-module contradiction was detected at the current evidence threshold."]
        : ["Objective problem solving is stronger than distributed failure-recovery evidence; validate crash recovery and multi-region operation."],
      verifiedStrengths: strong ? ["Distributed-systems invariants", "Objective coding execution", "Incident and observability reasoning"] : ["Implementation fundamentals", "Problem comprehension", "Honest uncertainty handling"],
      scopedRisks: strong ? ["Product-cost tradeoff framing needs one targeted follow-up."] : ["Crash-recovery depth is only partially verified.", "Multi-region operations remain untested."],
      nextActions: strong ? ["Run one product-cost tradeoff discussion with a hiring manager.", "Use the report evidence in the final panel decision."] : ["Run a 30-minute crash-recovery design probe.", "Ask for one independently implemented reliability work sample."],
      evidenceBasis: { aptitudeScore, dsaScore, antigravityScore, antigravityVerdict: strong ? "STRONG HIRE" : "HIRE WITH FOLLOW-UP", scoreSpread: Math.max(aptitudeScore, dsaScore, antigravityScore) - Math.min(aptitudeScore, dsaScore, antigravityScore) },
    },
    modules: {
      aptitude: { latest: { id: `${registration.userId}-aptitude-result`, score: aptitudeScore, completedAt: now, answers: { totalQuestions: 30, correct: strong ? 27 : 23, incorrect: strong ? 2 : 5, skipped: strong ? 1 : 2, totalMarks: 100, earnedMarks: aptitudeScore, categories: [{ name: "Logical reasoning", score: strong ? 94 : 82 }, { name: "Quantitative aptitude", score: strong ? 89 : 76 }, { name: "Computer science fundamentals", score: strong ? 91 : 79 }] } }, history: [] },
      dsa: { latest: { id: `${registration.userId}-dsa-result`, score: dsaScore, completedAt: now, answers: { language: "TypeScript", totalProblems: 2, passedProblems: strong ? 2 : 1, testCasesPassed: strong ? 21 : 17, testCasesTotal: 22, complexityAssessment: strong ? "Optimal time complexity with bounded auxiliary space." : "Correct core solution; recovery and edge-case handling need follow-up.", problems: [{ title: "Rate-limited event processor", score: strong ? 46 : 40, status: "passed", timeComplexity: "O(n log n)" }, { title: "Idempotent delivery ledger", score: strong ? 42 : 36, status: strong ? "passed" : "partial", timeComplexity: "O(n)" }] } }, history: [] },
      antigravity: {
        latest: {
          id: `${registration.userId}-ag-report`,
          antigravitySessionId: `local_${registration.userId}_session`,
          schemaVersion: "final_report_v2",
          overallScore: strong ? 9.1 : 7.4,
          hireRecommendation: strong ? "STRONG HIRE" : "HIRE WITH FOLLOW-UP",
          confidenceScore: strong ? 0.91 : 0.78,
          report: {
            recruiter_summary: strong
              ? "Riya converted resume claims into mechanism-level evidence and held up under failure-mode pressure. The remaining risk is scoped to product prioritization under ambiguous cost constraints."
              : "Arjun showed solid implementation fundamentals and honest boundaries. A targeted follow-up on distributed failure recovery would reduce the remaining uncertainty.",
            strengths: strong
              ? ["Concrete distributed-systems invariants", "Strong incident and observability evidence", "Clear authorship boundaries"]
              : ["Good implementation fundamentals", "Honest uncertainty handling", "Clear communication"],
            risk_flags: strong
              ? ["Needs sharper product framing when reliability competes with cost"]
              : ["Distributed crash-recovery depth remains partially tested", "Limited evidence for multi-region operation"],
            scores: strong ? { technical_depth: 9.4, reasoning_structure: 9.1, production_awareness: 9.5, communication: 8.6 } : { technical_depth: 7.2, reasoning_structure: 7.8, production_awareness: 6.8, communication: 8.1 },
            coverage_portrait: { coverage_score: strong ? 0.88 : 0.72, coverage_confidence: strong ? 0.92 : 0.79, primary_domain: { voluntary_coverage: strong ? ["Failure modes", "Observability", "Ownership"] : ["Implementation fundamentals", "Communication"], recovered_coverage: ["Product tradeoffs"], missed_coverage: strong ? [] : ["Multi-region recovery"], incorrect_coverage: [] } },
            claim_findings: [{ claim: "Owned production reliability improvements", status: strong ? "substantiated" : "partial", interpretation: strong ? "Mechanism, incident trigger, rollout, and ownership boundaries survived pressure testing." : "Implementation contribution was credible; end-to-end operational ownership remained shared." }],
            recommended_followups: strong ? ["Ask for a product-cost prioritization memo."] : ["Probe crash recovery after a write-before-ack failure.", "Validate multi-region operational ownership."],
          },
          evidencePacket: { schema_version: "final_evidence_packet_v2", evidence_turns: 16 },
          telemetrySummary: { total_events: strong ? 184 : 161 },
          transcript: Array.from({ length: strong ? 16 : 14 }, (_, index) => ({ turn: index + 1 })),
          receivedAt: now,
          interview: {
            id: `${registration.userId}-interview-record`,
            jobRole: candidate.jobSeekerProfile?.targetJobTitle,
            totalScore: strong ? 91 : 74,
            badgeLevel: strong ? "exceptional" : "verified",
            finalVerdict: strong ? "STRONG HIRE" : "HIRE WITH FOLLOW-UP",
            completedAt: now,
          },
          _count: { telemetryEvents: strong ? 184 : 161 },
        },
        history: [],
      },
    },
  };
}

export const preview = {
  registrations,
  dossiers: Object.fromEntries(registrations.map((registration, index) => [registration.userId, dossierFor(registration, index * 12)])),
};

const rounds = [
  { icon: BrainCircuit, name: "Aptitude round", detail: "30 questions · 30 minutes", state: "Unlocked" },
  { icon: Code2, name: "DSA round", detail: "2 coding tasks · 60 minutes", state: "Unlocked" },
  { icon: RadioTower, name: "Antigravity interview", detail: "Adaptive voice interview · Report V2", state: "Unlocked" },
];

export default function WorkspaceLocalPreviewPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Local preview mode — authentication and round locks are bypassed</p>
              <p className="mt-1 text-sm text-amber-800">This route and its fixture data only exist when Vite runs in development mode. Production builds redirect it away.</p>
            </div>
          </div>
        </div>

        <header className="rounded-xl border bg-background p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ProvenHire workspace preview</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Backend Engineering Hiring Sprint</h1>
              <p className="mt-2 text-muted-foreground">ProvenHire · LOCAL-DEMO · Candidate assessment pipeline</p>
            </div>
            <Badge className="bg-emerald-600">All rounds open</Badge>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Unlocked assessment rounds">
          {rounds.map(({ icon: Icon, name, detail, state }) => (
            <Card key={name}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{state}</Badge>
                </div>
                <CardTitle className="pt-3 text-lg">{name}</CardTitle>
                <CardDescription>{detail}</CardDescription>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">Result persists into the unified candidate dossier shown below.</p></CardContent>
            </Card>
          ))}
        </section>

        <WorkspaceRegistrationsTable workspaceId={workspaceId} readonly preview={preview} />
      </div>
    </main>
  );
}
