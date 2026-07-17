import assert from "node:assert/strict";

import {
  REPORT_AGENT_MODEL,
  REPORT_UNIFIED_ESCALATION_MODEL,
  selectAssessmentReportModel,
} from "../src/services/assessmentReportAgent.service.js";

function evidence(input: {
  spread: number;
  contradictions?: string[];
  confidence?: number;
}) {
  return {
    deterministicSynthesis: {
      evidenceBasis: { scoreSpread: input.spread },
      contradictions: input.contradictions ?? [
        "No material cross-module contradiction was detected at the current evidence threshold.",
      ],
    },
    antigravity: {
      report: { confidence_score: input.confidence ?? 0.9 },
    },
  };
}

const dsa = selectAssessmentReportModel("dsa", evidence({ spread: 40, confidence: 0.4 }));
assert.equal(dsa.tier, "standard");
assert.equal(dsa.model, REPORT_AGENT_MODEL);

const routineUnified = selectAssessmentReportModel("unified", evidence({ spread: 8, confidence: 0.9 }));
assert.equal(routineUnified.tier, "standard");
assert.equal(routineUnified.model, REPORT_AGENT_MODEL);

const largeSpread = selectAssessmentReportModel("unified", evidence({ spread: 31, confidence: 0.9 }));
assert.equal(largeSpread.tier, "escalated");
assert.equal(largeSpread.model, REPORT_UNIFIED_ESCALATION_MODEL);
assert.match(largeSpread.reasons.join(" "), /score spread 31/);

const combinedAmbiguity = selectAssessmentReportModel("unified", evidence({
  spread: 12,
  contradictions: ["Objective coding is stronger than interview reasoning."],
  confidence: 0.6,
}));
assert.equal(combinedAmbiguity.tier, "escalated");
assert.equal(combinedAmbiguity.model, REPORT_UNIFIED_ESCALATION_MODEL);
assert.equal(combinedAmbiguity.reasons.length, 2);

const isolatedContradiction = selectAssessmentReportModel("unified", evidence({
  spread: 12,
  contradictions: ["One material contradiction requires review."],
  confidence: 0.9,
}));
assert.equal(isolatedContradiction.tier, "standard");
assert.equal(isolatedContradiction.model, REPORT_AGENT_MODEL);

process.stdout.write("report model routing contract: 5/5 passed\n");
