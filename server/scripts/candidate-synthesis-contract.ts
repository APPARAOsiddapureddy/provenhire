import assert from "node:assert/strict";
import {
  buildCandidateAssessmentSynthesis,
  buildConfiguredCandidateAssessmentSynthesis,
} from "../src/services/workspaceRegistration.service.js";

const modules = {
  aptitude: { score: 91 },
  dsa: { score: 88 },
  antigravity: {
    overallScore: 6,
    hireRecommendation: "MAYBE",
    report: { strengths: ["Explains trade-offs"], risk_flags: ["Depth gap"] },
    interview: { jobRole: "Full Stack Developer" },
  },
};

const linked = buildCandidateAssessmentSynthesis({
  ...modules,
  targetRole: "Full-stack developer",
  roleResponsibilities: [
    "Own reliable services",
    "Debug production incidents",
    "Design observable APIs",
  ],
  workspaceInterviewLinked: true,
});
assert.equal(linked.schemaVersion, "candidate_assessment_synthesis_v2");
assert.equal(linked.decisionStatus, "human_review_required");
assert.equal(linked.recommendation, "HUMAN REVIEW REQUIRED");
assert.equal(linked.compositeScore, null);
assert.equal(linked.confidence, null);
assert.equal(linked.integrity.status, "verified");
assert.equal(
  linked.decisionGates.find((gate) => gate.key === "role_rubric")?.status,
  "ready",
);

const wrongRole = buildCandidateAssessmentSynthesis({
  ...modules,
  targetRole: "Data Scientist",
  workspaceInterviewLinked: true,
});
assert.equal(wrongRole.decisionStatus, "blocked_integrity");
assert.match(wrongRole.integrity.issues.join(" "), /Role mismatch/);

const unbound = buildCandidateAssessmentSynthesis({
  ...modules,
  targetRole: "Full Stack Developer",
  workspaceInterviewLinked: false,
});
assert.equal(unbound.decisionStatus, "blocked_integrity");
assert.match(unbound.integrity.issues.join(" "), /not linked/);

const incomplete = buildCandidateAssessmentSynthesis({
  aptitude: modules.aptitude,
  dsa: null,
  antigravity: null,
  targetRole: "Full Stack Developer",
  workspaceInterviewLinked: false,
});
assert.equal(incomplete.decisionStatus, "insufficient_evidence");
assert.equal(incomplete.completedModules, 1);

const configuredFourRound = buildConfiguredCandidateAssessmentSynthesis({
  configuredModules: ["aptitude", "dsa", "sql", "interview"],
  aptitude: { score: 84 },
  dsa: { score: 76 },
  sql: { score: 92 },
  interview: {
    score: 81,
    report: { strongestConvertingSignals: ["Explains trade-offs"] },
    artifactRole: "Full Stack Developer",
  },
  targetRole: "Full Stack Developer",
  roleResponsibilities: [
    "Own reliable services",
    "Debug production incidents",
    "Design observable APIs",
  ],
  workspaceInterviewLinked: true,
  evidenceComplete: {
    aptitude: true,
    dsa: true,
    sql: true,
    interview: true,
  },
});
assert.equal(configuredFourRound.decisionStatus, "human_review_required");
assert.equal(configuredFourRound.completedModules, 4);
assert.deepEqual(configuredFourRound.requiredModules, [
  "aptitude",
  "dsa",
  "sql",
  "interview",
]);
assert.equal(configuredFourRound.evidenceBasis.sqlScore, 92);
assert.equal(configuredFourRound.evidenceBasis.interviewScore, 81);

const configuredMissingSqlEvidence = buildConfiguredCandidateAssessmentSynthesis({
  configuredModules: ["aptitude", "dsa", "sql", "interview"],
  aptitude: { score: 84 },
  dsa: { score: 76 },
  sql: { score: 92 },
  interview: { score: 81, artifactRole: "Full Stack Developer" },
  targetRole: "Full Stack Developer",
  workspaceInterviewLinked: true,
  evidenceComplete: {
    aptitude: true,
    dsa: true,
    sql: false,
    interview: true,
  },
});
assert.equal(configuredMissingSqlEvidence.decisionStatus, "insufficient_evidence");
assert.deepEqual(configuredMissingSqlEvidence.missingModuleKeys, ["sql"]);
assert.match(configuredMissingSqlEvidence.overallRead, /SQL/);

console.log("candidate synthesis contract: 6/6 scenarios passed");
