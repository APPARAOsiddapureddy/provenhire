import { createHash } from "node:crypto";

export type AssessmentEvidenceKind = "dsa" | "unified";

export function assessmentEvidenceFor(kind: AssessmentEvidenceKind, dossier: any) {
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
    antigravity: dossier.modules.antigravity.latest
      ? {
          overallScore: dossier.modules.antigravity.latest.overallScore,
          report: dossier.modules.antigravity.latest.report,
          evidencePacket:
            "evidencePacket" in dossier.modules.antigravity.latest
              ? dossier.modules.antigravity.latest.evidencePacket
              : null,
        }
      : null,
  };
}

export function assessmentEvidenceHash(kind: AssessmentEvidenceKind, dossier: any) {
  return createHash("sha256")
    .update(JSON.stringify(assessmentEvidenceFor(kind, dossier)))
    .digest("hex");
}
