import { createHash } from "node:crypto";

export type AssessmentEvidenceKind = "dsa" | "unified";

type AssessmentEvidenceDossier = {
  candidate: unknown;
  registration: unknown;
  synthesis: unknown;
  modules: {
    aptitude: unknown;
    dsa: unknown;
    sql: unknown;
    interview: unknown;
    antigravity?: { latest?: unknown };
  };
};

// roundAttempts carries every round's own artifact nested inside it
// (placementReadinessHandoff.artifact.artifact for the interview round, other
// modules' scores directly on each attempt) - passing it through whole would
// leak other modules' evidence into a single-module report the same way
// dossier.synthesis did. Scope it to only the round(s) this report kind is
// actually about.
function scopeRegistrationToRoundType(registration: unknown, roundType: string) {
  const reg =
    registration && typeof registration === "object" && !Array.isArray(registration)
      ? (registration as Record<string, unknown>)
      : {};
  const attempts = Array.isArray(reg.roundAttempts) ? reg.roundAttempts : [];
  return {
    ...reg,
    roundAttempts: attempts.filter(
      (attempt) =>
        attempt &&
        typeof attempt === "object" &&
        (attempt as Record<string, unknown>).workspaceRound &&
        typeof (attempt as Record<string, unknown>).workspaceRound === "object" &&
        ((attempt as Record<string, unknown>).workspaceRound as Record<string, unknown>).type ===
          roundType,
    ),
  };
}

export function assessmentEvidenceFor(
  kind: AssessmentEvidenceKind,
  dossier: AssessmentEvidenceDossier,
) {
  if (kind === "dsa") {
    return {
      candidate: dossier.candidate,
      registration: scopeRegistrationToRoundType(dossier.registration, "coding"),
      dsa: dossier.modules.dsa,
    };
  }
  const identity = {
    candidate: dossier.candidate,
    registration: dossier.registration,
  };
  return {
    ...identity,
    deterministicSynthesis: dossier.synthesis,
    aptitude: dossier.modules.aptitude,
    dsa: dossier.modules.dsa,
    sql: dossier.modules.sql,
    interview: dossier.modules.interview,
    // Retained for old completed records and prompt compatibility during rollout.
    antigravity: dossier.modules.antigravity?.latest ?? null,
  };
}

export function assessmentEvidenceHash(
  kind: AssessmentEvidenceKind,
  dossier: AssessmentEvidenceDossier,
) {
  return createHash("sha256")
    .update(JSON.stringify(assessmentEvidenceFor(kind, dossier)))
    .digest("hex");
}
