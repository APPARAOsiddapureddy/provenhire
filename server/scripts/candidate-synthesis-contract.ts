import assert from "node:assert/strict";
import { buildCandidateAssessmentSynthesis } from "../src/services/workspaceRegistration.service.js";

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

console.log("candidate synthesis contract: 4/4 scenarios passed");
