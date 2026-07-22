import assert from "node:assert/strict";

import {
  CANDIDATE_FORBIDDEN_REPORT_KEYS,
  sanitizeAntigravityReportForCandidate,
  sanitizeDsaWorkspaceEvidenceForCandidate,
  sanitizePlacementReportForCandidate,
} from "../src/services/candidateDossierSanitizer.js";
import {
  assertGroundedAssessmentReport,
  canonicalizeAssessmentCitation,
  canonicalizeAssessmentReportCitations,
} from "../src/services/assessmentReportAgent.service.js";
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

const candidatePlacement = sanitizePlacementReportForCandidate({
  scorecard: {
    overallScore: 82,
    readinessBand: "interview ready",
    reasoningSummary: "Clear, evidence-backed answers.",
    dimensionScores: { communication: 84, technicalDepth: 79 },
    privateDecisionScore: 0.91,
  },
  readinessVerdict: {
    summary: "Ready for a focused follow-up.",
    hiringRecommendation: "ADVANCE",
  },
  strongestConvertingSignals: ["Explained a concrete trade-off."],
  avoidableRejectionRisks: ["Needs a clearer recovery invariant."],
  questionReviews: [
    {
      slotId: "q1",
      questionText: "How do you recover after a crash?",
      answerBand: "partial",
      whatWasGood: ["Named idempotency."],
      strongerAnswerWouldInclude: ["Bind write and acknowledgement."],
      recruiterNote: "Do not expose this note.",
    },
  ],
  sevenDayPlan: ["Practice one recovery design."],
  hireRecommendation: "ADVANCE",
  transcript: [{ private: true }],
  telemetrySummary: { private: true },
});
const placementJson = JSON.stringify(candidatePlacement);
assert.equal(placementJson.includes("ADVANCE"), false);
assert.equal(placementJson.includes("recruiterNote"), false);
assert.equal(placementJson.includes("transcript"), false);
assert.equal(placementJson.includes("telemetrySummary"), false);
assert.equal(placementJson.includes("Explained a concrete trade-off."), true);

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

const placementEvidence = {
  interview: {
    latest: {
      report: {
        scorecard: {
          recurringStrengths: ["Project ownership"],
          recurringWeaknesses: ["Programming logic"],
        },
        questionReviews: [{ answerBand: "Good" }],
      },
    },
  },
};
assert.equal(
  canonicalizeAssessmentCitation(
    "/interview/latest/report/recurringStrengths/0 :: project ownership",
    placementEvidence,
  ),
  "/interview/latest/report/scorecard/recurringStrengths/0 :: Project ownership",
);
const repairedGrounding = canonicalizeAssessmentReportCitations(
  {
    reinforcingSignals: [{
      claim: "Grounded placement signal",
      evidence: [
        "/interview/latest/report/recurringStrengths/0 :: project ownership",
        "/interview/latest/report/questionReviews/0/answerBand :: good",
      ],
      support: "direct",
    }],
  },
  placementEvidence,
);
assert.doesNotThrow(() =>
  assertGroundedAssessmentReport(repairedGrounding, placementEvidence),
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

console.log("report integrity contract: 8/8 passed");
