import assert from "node:assert/strict";

import {
  CANDIDATE_FORBIDDEN_REPORT_KEYS,
  sanitizeAntigravityReportForCandidate,
  sanitizeDsaWorkspaceEvidenceForCandidate,
} from "../src/services/candidateDossierSanitizer.js";
import { assertGroundedAssessmentReport } from "../src/services/assessmentReportAgent.service.js";
import { buildCandidateAssessmentSynthesis } from "../src/services/workspaceRegistration.service.js";

const candidateArtifact = sanitizeAntigravityReportForCandidate({
  id: "ag-1",
  antigravitySessionId: "session-1",
  schemaVersion: "final_report_v2",
  overallScore: 6,
  hireRecommendation: "MAYBE",
  confidenceScore: 0.6,
  evidencePacket: { private: true },
  telemetrySummary: { private: true },
  transcript: [{ private: true }],
  report: {
    preview_replay_case_id: "case-1",
    tested_strengths: ["Directly tested strength"],
    tested_risks: ["Directly tested risk"],
  },
  receivedAt: "2026-07-16T00:00:00.000Z",
  interview: {
    id: "interview-1",
    jobRole: "Backend Engineer",
    finalVerdict: "MAYBE",
    badgeLevel: "developing",
    totalScore: 60,
    completedAt: "2026-07-16T00:00:00.000Z",
  },
  _count: { telemetryEvents: 184 },
});
const candidateJson = JSON.stringify(candidateArtifact);
for (const key of CANDIDATE_FORBIDDEN_REPORT_KEYS)
  assert.equal(candidateJson.includes(`"${key}"`), false, `leaked ${key}`);

const candidateDsa = sanitizeDsaWorkspaceEvidenceForCandidate({
  attemptId: "attempt-1",
  roundSessionId: "round-1",
  score: 50,
  submissions: [
    {
      id: "submission-1",
      questionId: "q-1",
      language: "TypeScript",
      code: "return solve(input)",
      passedCount: 1,
      totalCount: 2,
      submittedAt: "2026-07-16T00:00:00.000Z",
      question: { id: "q-1", title: "Example", description: "Solve it" },
      results: {
        results: [
          { passed: true, input: "public", expected: "ok", actual: "ok" },
          {
            passed: false,
            hidden: true,
            input: "secret hidden input",
            expected: "secret expected",
            actual: "wrong",
            message: "Hidden case failed",
          },
        ],
      },
    },
  ],
});
const dsaJson = JSON.stringify(candidateDsa);
assert.equal(dsaJson.includes("secret hidden input"), false);
assert.equal(dsaJson.includes("secret expected"), false);
assert.equal(dsaJson.includes("public"), true);

const groundedEvidence = { modules: { dsa: { score: 88 } } };
assert.doesNotThrow(() =>
  assertGroundedAssessmentReport(
    {
      verifiedStrengths: [
        {
          claim: "Stored score exists",
          evidence: ["/modules/dsa/score :: 88"],
          support: "direct",
        },
      ],
    },
    groundedEvidence,
  ),
);
assert.throws(() =>
  assertGroundedAssessmentReport(
    {
      verifiedStrengths: [
        {
          claim: "Invented claim",
          evidence: ["/modules/dsa/score :: 99"],
          support: "direct",
        },
      ],
    },
    groundedEvidence,
  ),
);

const partial = buildCandidateAssessmentSynthesis({
  aptitude: { score: 91 },
  dsa: { score: 88 },
  antigravity: {
    overallScore: 6,
    hireRecommendation: "MAYBE",
    report: { strengths: ["Unsupported strength"] },
    interview: { jobRole: "Backend Engineer" },
  },
  targetRole: "Backend Engineer",
  roleResponsibilities: ["Build APIs", "Debug incidents", "Protect data"],
  workspaceInterviewLinked: true,
  aptitudeEvidenceComplete: false,
  dsaEvidenceComplete: false,
  antigravityEvidenceComplete: true,
});
assert.equal(partial.decisionStatus, "insufficient_evidence");
assert.equal(partial.evidenceBasis.antigravityVerdict, null);
assert.deepEqual(partial.verifiedStrengths, []);
assert.equal(
  partial.decisionGates.find((gate) => gate.key === "module_evidence")?.status,
  "incomplete",
);

const complete = buildCandidateAssessmentSynthesis({
  aptitude: { score: 91 },
  dsa: { score: 88 },
  antigravity: {
    overallScore: 6,
    hireRecommendation: "MAYBE",
    report: { tested_strengths: ["Bound interview evidence"] },
    interview: { jobRole: "Backend Engineer" },
  },
  targetRole: "Backend Engineer",
  roleResponsibilities: ["Build APIs", "Debug incidents", "Protect data"],
  workspaceInterviewLinked: true,
  aptitudeEvidenceComplete: true,
  dsaEvidenceComplete: true,
  antigravityEvidenceComplete: true,
});
assert.equal(complete.decisionStatus, "human_review_required");
assert.equal(complete.recommendation, "HUMAN REVIEW REQUIRED");
assert.equal(complete.evidenceBasis.antigravityVerdict, null);

console.log("report integrity contract: 5/5 passed");
