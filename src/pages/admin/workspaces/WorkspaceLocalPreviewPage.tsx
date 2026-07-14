import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Code2, BrainCircuit, RadioTower, ShieldCheck } from "lucide-react";

import { WorkspaceRegistrationsTable } from "./WorkspaceAdminComponents";
import type { WorkspaceCandidateDossier, WorkspaceRegistration, WorkspaceRoundType } from "./types";

const now = new Date().toISOString();
const workspaceId = "local-preview-workspace";

const registrations: WorkspaceRegistration[] = [
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
  return {
    schemaVersion: "workspace_candidate_dossier_v1",
    workspaceId,
    candidate,
    registration: {
      id: registration.id,
      status: registration.status,
      registeredAt: registration.registeredAt,
      roundAttempts: [
        attempt(`${registration.userId}-aptitude`, 1, "Aptitude round", "mcq", 91 - scoreOffset),
        attempt(`${registration.userId}-dsa`, 2, "DSA round", "coding", 88 - scoreOffset),
        attempt(`${registration.userId}-interview`, 3, "Antigravity interview", "interview", 91 - scoreOffset),
      ],
    },
    modules: {
      aptitude: { latest: { id: `${registration.userId}-aptitude-result`, score: 91 - scoreOffset, completedAt: now }, history: [] },
      dsa: { latest: { id: `${registration.userId}-dsa-result`, score: 88 - scoreOffset, completedAt: now }, history: [] },
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

const preview = {
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
