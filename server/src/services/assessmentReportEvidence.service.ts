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

export function assessmentEvidenceFor(
  kind: AssessmentEvidenceKind,
  dossier: AssessmentEvidenceDossier,
) {
  const base = {
    candidate: dossier.candidate,
    registration: dossier.registration,
    deterministicSynthesis: dossier.synthesis,
  };
  if (kind === "dsa") return { ...base, dsa: dossier.modules.dsa };
  return {
    ...base,
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
