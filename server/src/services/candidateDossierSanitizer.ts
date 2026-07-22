type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Candidate report payloads are constructed from an allowlist. Never spread a
 * recruiter artifact here: those rows also contain transcript, telemetry,
 * evidence packets, report history, evaluator confidence, and legacy hiring
 * verdicts that are not part of candidate coaching.
 */
export function sanitizeAntigravityReportForCandidate(value: unknown) {
  const artifact = record(value);
  const report = record(artifact.report);
  const interview = record(artifact.interview);
  const count = record(artifact._count);

  return {
    id: String(artifact.id ?? ""),
    antigravitySessionId: String(artifact.antigravitySessionId ?? ""),
    schemaVersion: String(artifact.schemaVersion ?? "final_report_v2"),
    overallScore: optionalNumber(artifact.overallScore),
    report: {
      preview_replay_case_id: optionalString(report.preview_replay_case_id),
      tested_strengths: stringArray(
        report.tested_strengths ?? report.strengths,
      ),
      tested_risks: stringArray(report.tested_risks ?? report.risk_flags),
    },
    receivedAt: String(artifact.receivedAt ?? ""),
    interview: {
      id: String(interview.id ?? ""),
      jobRole: optionalString(interview.jobRole),
      completedAt: optionalString(interview.completedAt),
    },
    _count: {
      telemetryEvents: Math.max(0, Number(count.telemetryEvents) || 0),
    },
  };
}

function numericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, raw]) => {
      const parsed = optionalNumber(raw);
      return parsed == null ? [] : [[key, parsed]];
    }),
  );
}

/**
 * Placement Readiness artifacts can contain reviewer-only fields alongside
 * candidate coaching. Build the candidate payload from an allowlist so adding
 * a new recruiter field upstream can never expose it here by accident.
 */
export function sanitizePlacementReportForCandidate(value: unknown) {
  const report = record(value);
  const scorecard = record(report.scorecard);
  const verdict = record(report.readinessVerdict);
  const validation = record(report.validationSummary);
  const coverage = record(report.coverageSummary);
  const delivery = record(report.deliveryRead);
  const ownership = record(report.projectOwnershipRead);
  const questionReviews = Array.isArray(report.questionReviews)
    ? report.questionReviews.map((raw) => {
        const question = record(raw);
        return {
          slotId: optionalString(question.slotId),
          slotLabel: optionalString(question.slotLabel),
          answerBand: optionalString(question.answerBand),
          questionText: optionalString(question.questionText),
          answerSummary: optionalString(question.answerSummary),
          whatWasGood: stringArray(question.whatWasGood),
          strongerAnswerWouldInclude: stringArray(
            question.strongerAnswerWouldInclude,
          ),
        };
      })
    : [];

  return {
    scorecard: {
      overallScore: optionalNumber(scorecard.overallScore),
      readinessBand: optionalString(scorecard.readinessBand),
      reasoningSummary: optionalString(scorecard.reasoningSummary),
      dimensionScores: numericRecord(scorecard.dimensionScores),
    },
    readinessVerdict: {
      summary: optionalString(verdict.summary),
    },
    validationSummary: {
      validationPassed: validation.validationPassed === true,
    },
    coverageSummary: {
      testedSlots: stringArray(coverage.testedSlots),
      lightlyTestedSlots: stringArray(coverage.lightlyTestedSlots),
      testedDimensions: stringArray(coverage.testedDimensions),
      lightlyTestedDimensions: stringArray(
        coverage.lightlyTestedDimensions,
      ),
      untestedDimensions: stringArray(coverage.untestedDimensions),
      confidenceNote: optionalString(coverage.confidenceNote),
    },
    strongestConvertingSignals: stringArray(report.strongestConvertingSignals),
    avoidableRejectionRisks: stringArray(report.avoidableRejectionRisks),
    deliveryRead: {
      summary: optionalString(delivery.summary),
      pressureHandlingSignal: optionalString(delivery.pressureHandlingSignal),
    },
    projectOwnershipRead: {
      summary: optionalString(ownership.summary),
      authenticitySignal: optionalString(ownership.authenticitySignal),
    },
    questionReviews,
    sevenDayPlan: stringArray(report.sevenDayPlan),
    thirtyDayPlan: stringArray(report.thirtyDayPlan),
  };
}

export function sanitizeAssessmentGenerationForCandidate(
  value: unknown,
  kind: "dsa" | "unified",
) {
  const generation = record(value);
  if (!Object.keys(generation).length) return null;
  const result = record(generation.result);

  const candidateCitation = (citationValue: unknown) => {
    if (typeof citationValue === "string") return citationValue;
    const item = record(citationValue);
    const claim = optionalString(item.claim);
    if (!claim) return null;
    return {
      claim,
      evidence: stringArray(item.evidence),
      support: optionalString(item.support),
    };
  };
  const candidateCitations = (citationValues: unknown) =>
    (Array.isArray(citationValues) ? citationValues : [])
      .map(candidateCitation)
      .filter((item): item is NonNullable<typeof item> => item !== null);

  const safeResult =
    kind === "dsa"
      ? {
          verifiedStrengths: Array.isArray(result.verifiedStrengths)
            ? result.verifiedStrengths
            : [],
          failureAndRiskAnalysis: Array.isArray(result.failureAndRiskAnalysis)
            ? result.failureAndRiskAnalysis
            : [],
          candidatePracticePrompts: Array.isArray(result.problemReads)
            ? result.problemReads
                .map((item) => optionalString(record(item).followUpReasoning))
                .filter((item): item is string => Boolean(item))
            : [],
        }
      : {
          executiveRead: candidateCitation(result.executiveRead),
          crossModuleThesis: candidateCitation(result.crossModuleThesis),
          reinforcingSignals: candidateCitations(result.reinforcingSignals),
          contradictions: candidateCitations(result.contradictions),
          roleFit: record(result.roleFit),
          evidenceLimits: stringArray(result.evidenceLimits),
        };

  return {
    id: String(generation.id ?? ""),
    reportKind: String(generation.reportKind ?? kind),
    promptVersion: String(generation.promptVersion ?? ""),
    model: String(generation.model ?? ""),
    result: safeResult,
    completedAt: optionalString(generation.completedAt),
    sourceHash: String(generation.sourceHash ?? ""),
  };
}

function judgeRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(record);
  const payload = record(value);
  return Array.isArray(payload.results) ? payload.results.map(record) : [];
}

export function sanitizeDsaWorkspaceEvidenceForCandidate(value: unknown) {
  const evidence = record(value);
  const submissions = Array.isArray(evidence.submissions)
    ? evidence.submissions.map((raw) => {
        const submission = record(raw);
        const question = record(submission.question);
        const results = judgeRows(submission.results).map((row) => {
          const hidden = Boolean(row.hidden ?? row.isHidden ?? row.is_hidden);
          return {
            passed: row.passed === true,
            status: optionalString(row.status),
            message: optionalString(row.message ?? row.error),
            ...(hidden
              ? { visibility: "hidden" }
              : {
                  visibility: "candidate_visible",
                  input: row.input ?? null,
                  expected: row.expected ?? row.expectedOutput ?? null,
                  actual: row.actual ?? row.actualOutput ?? null,
                }),
          };
        });
        return {
          id: String(submission.id ?? ""),
          questionId: String(submission.questionId ?? ""),
          language: String(submission.language ?? ""),
          code: String(submission.code ?? ""),
          passedCount: Math.max(0, Number(submission.passedCount) || 0),
          totalCount: Math.max(0, Number(submission.totalCount) || 0),
          results: { results },
          submittedAt: String(submission.submittedAt ?? ""),
          question: {
            id: String(question.id ?? submission.questionId ?? ""),
            title: String(question.title ?? "Problem"),
            description: String(question.description ?? ""),
            difficulty: String(question.difficulty ?? ""),
            examples: question.examples ?? null,
            constraints: stringArray(question.constraints),
          },
        };
      })
    : [];
  return {
    attemptId: String(evidence.attemptId ?? ""),
    roundSessionId: String(evidence.roundSessionId ?? ""),
    score: optionalNumber(evidence.score),
    completedAt: optionalString(evidence.completedAt),
    submissions,
  };
}

export const CANDIDATE_FORBIDDEN_REPORT_KEYS = [
  "hireRecommendation",
  "confidenceScore",
  "finalVerdict",
  "badgeLevel",
  "totalScore",
  "evidencePacket",
  "telemetrySummary",
  "transcript",
  "history",
  "recordedDecision",
  "decisionGates",
  "recommendedPanelProbes",
] as const;
