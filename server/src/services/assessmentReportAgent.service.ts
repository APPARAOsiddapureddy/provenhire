import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { WorkspaceServiceError } from "./workspace.service.js";
import { getWorkspaceCandidateDossier, type WorkspaceActor } from "./workspaceRegistration.service.js";
import { assessmentEvidenceFor, assessmentEvidenceHash } from "./assessmentReportEvidence.service.js";

export const REPORT_AGENT_PROMPT_VERSION = "assessment_report_agents_v5_evidence_editorial";
export const REPORT_AGENT_MODEL = process.env.REPORT_AGENT_MODEL?.trim() || "google/gemini-2.5-flash";
export const REPORT_UNIFIED_ESCALATION_MODEL = process.env.REPORT_UNIFIED_ESCALATION_MODEL?.trim() || "google/gemini-3.1-pro-preview";
export const REPORT_UNIFIED_ESCALATION_ENABLED = process.env.REPORT_UNIFIED_ESCALATION_ENABLED?.trim().toLowerCase() !== "false";
export const REPORT_UNIFIED_ESCALATION_SCORE_SPREAD = Number(process.env.REPORT_UNIFIED_ESCALATION_SCORE_SPREAD || 20);
export const REPORT_UNIFIED_ESCALATION_CONFIDENCE_MAX = Number(process.env.REPORT_UNIFIED_ESCALATION_CONFIDENCE_MAX || 0.7);
export const REPORT_CRITIC_MODEL = process.env.REPORT_CRITIC_MODEL?.trim() || "gpt-oss-120b";
export const REPORT_CRITIC_PROVIDER = process.env.REPORT_CRITIC_PROVIDER?.trim().toLowerCase() || "cerebras";

export type AssessmentReportModelRoute = {
  model: string;
  tier: "standard" | "escalated";
  reasons: string[];
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function selectAssessmentReportModel(
  kind: AssessmentReportKind,
  evidence: unknown,
): AssessmentReportModelRoute {
  if (kind !== "unified" || !REPORT_UNIFIED_ESCALATION_ENABLED) {
    return { model: REPORT_AGENT_MODEL, tier: "standard", reasons: [] };
  }

  const root = objectValue(evidence);
  const synthesis = objectValue(root.deterministicSynthesis);
  const evidenceBasis = objectValue(synthesis.evidenceBasis);
  const scoreSpread = finiteNumber(evidenceBasis.scoreSpread);
  const contradictions = Array.isArray(synthesis.contradictions)
    ? synthesis.contradictions.map(String).filter((item) =>
        !item.startsWith("No material") &&
        !item.startsWith("Cross-module comparison is withheld"))
    : [];
  const antigravity = objectValue(root.antigravity);
  const report = objectValue(antigravity.report);
  const packet = objectValue(antigravity.evidencePacket);
  const rawConfidence = [
    report.confidence_score,
    report.confidence,
    packet.confidence_score,
    packet.confidence,
  ].map(finiteNumber).find((value): value is number => value !== null) ?? null;
  const confidence = rawConfidence === null
    ? null
    : rawConfidence > 1 ? rawConfidence / 100 : rawConfidence;

  const reasons: string[] = [];
  if (scoreSpread !== null && scoreSpread >= REPORT_UNIFIED_ESCALATION_SCORE_SPREAD)
    reasons.push(`cross-module score spread ${scoreSpread} >= ${REPORT_UNIFIED_ESCALATION_SCORE_SPREAD}`);
  if (contradictions.length)
    reasons.push(`${contradictions.length} material cross-module contradiction(s)`);
  if (confidence !== null && confidence < REPORT_UNIFIED_ESCALATION_CONFIDENCE_MAX)
    reasons.push(`Antigravity confidence ${confidence} < ${REPORT_UNIFIED_ESCALATION_CONFIDENCE_MAX}`);

  const shouldEscalate =
    (scoreSpread !== null && scoreSpread >= REPORT_UNIFIED_ESCALATION_SCORE_SPREAD) ||
    reasons.length >= 2;
  return shouldEscalate
    ? { model: REPORT_UNIFIED_ESCALATION_MODEL, tier: "escalated", reasons }
    : { model: REPORT_AGENT_MODEL, tier: "standard", reasons };
}

const citation = z.object({
  claim: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  support: z.enum(["direct", "derived", "limited"]),
});

export const dsaAgentReportSchema = z.object({
  schemaVersion: z.literal("dsa_reasoning_report_v3"),
  executiveRead: citation,
  evidenceStatus: z.enum(["complete", "partial", "insufficient_evidence"]),
  algorithmicReasoning: citation,
  implementationQuality: citation,
  correctnessBoundary: citation,
  verifiedStrengths: z.array(citation),
  failureAndRiskAnalysis: z.array(citation),
  problemReads: z.array(z.object({
    title: z.string().min(1),
    correctness: z.string().min(1),
    approach: z.string().min(1),
    complexity: z.string().min(1),
    codeQuality: z.string().min(1),
    edgeCaseRead: z.string().min(1),
    followUpReasoning: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
  })),
  recommendedPanelProbes: z.array(z.string()),
  evidenceLimits: z.array(z.string()),
});

export const unifiedAgentReportSchema = z.object({
  schemaVersion: z.literal("unified_reasoning_report_v3"),
  evidenceStatus: z.enum(["complete", "partial", "insufficient_evidence"]),
  executiveRead: citation,
  crossModuleThesis: citation,
  reinforcingSignals: z.array(citation),
  contradictions: z.array(citation),
  riskRegister: z.array(z.object({
    risk: z.string().min(1),
    severity: z.enum(["high", "medium", "low"]),
    evidence: z.array(z.string()),
    resolution: z.string().min(1),
  })),
  panelDecisionGuide: z.array(z.string()),
  evidenceLimits: z.array(z.string()),
});

export type AssessmentReportKind = "dsa" | "unified";

export function schemaFor(kind: AssessmentReportKind) {
  return kind === "dsa" ? dsaAgentReportSchema : unifiedAgentReportSchema;
}

export function jsonSchemaFor(kind: AssessmentReportKind): Record<string, unknown> {
  const citationProperties = {
    claim: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    support: { type: "string", enum: ["direct", "derived", "limited"] },
  };
  if (kind === "dsa") return {
    type: "object", additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", enum: ["dsa_reasoning_report_v3"] },
      executiveRead: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] }, evidenceStatus: { type: "string", enum: ["complete", "partial", "insufficient_evidence"] },
      algorithmicReasoning: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] }, implementationQuality: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] }, correctnessBoundary: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] },
      verifiedStrengths: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] } },
      failureAndRiskAnalysis: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] } },
      problemReads: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, correctness: { type: "string" }, approach: { type: "string" }, complexity: { type: "string" }, codeQuality: { type: "string" }, edgeCaseRead: { type: "string" }, followUpReasoning: { type: "string" }, evidence: { type: "array", items: { type: "string" } } }, required: ["title", "correctness", "approach", "complexity", "codeQuality", "edgeCaseRead", "followUpReasoning", "evidence"] } },
      recommendedPanelProbes: { type: "array", items: { type: "string" } }, evidenceLimits: { type: "array", items: { type: "string" } },
    },
    required: ["schemaVersion", "executiveRead", "evidenceStatus", "algorithmicReasoning", "implementationQuality", "correctnessBoundary", "verifiedStrengths", "failureAndRiskAnalysis", "problemReads", "recommendedPanelProbes", "evidenceLimits"],
  };
  return {
    type: "object", additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", enum: ["unified_reasoning_report_v3"] }, evidenceStatus: { type: "string", enum: ["complete", "partial", "insufficient_evidence"] }, executiveRead: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] }, crossModuleThesis: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] },
      reinforcingSignals: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] } }, contradictions: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "support"] } },
      riskRegister: { type: "array", items: { type: "object", additionalProperties: false, properties: { risk: { type: "string" }, severity: { type: "string", enum: ["high", "medium", "low"] }, evidence: { type: "array", items: { type: "string" } }, resolution: { type: "string" } }, required: ["risk", "severity", "evidence", "resolution"] } },
      panelDecisionGuide: { type: "array", items: { type: "string" } }, evidenceLimits: { type: "array", items: { type: "string" } },
    },
    required: ["schemaVersion", "evidenceStatus", "executiveRead", "crossModuleThesis", "reinforcingSignals", "contradictions", "riskRegister", "panelDecisionGuide", "evidenceLimits"],
  };
}

export function systemPrompt(kind: AssessmentReportKind): string {
  const schemaVersion = kind === "dsa" ? "dsa_reasoning_report_v3" : "unified_reasoning_report_v3";
  const shared = `You are a senior assessment-evidence analyst and exacting technical editor. Produce an advisory evidence interpretation from the supplied persisted evidence only. Set schemaVersion exactly to ${schemaVersion}. You do not recommend advance, hold, hire, or reject, and you do not calculate role readiness. Never invent a score, test, answer, behavior, responsibility, or claim. Distinguish directly recorded facts from derived interpretation. Every evidence citation MUST use the exact format /pointer/from/root :: exact source excerpt, for example /dsa/score :: 88. Use RFC 6901 slash-separated paths beginning at the supplied JSON root. The word "json" is not a path segment, and bracket notation such as problems[0] is invalid. Point to one scalar source value and copy that scalar verbatim after ::; do not paraphrase the excerpt and do not cite an object or array. Treat missing evidence as a limit, not as a negative fact.

Editorial rules:
- Write for a busy candidate or hiring reviewer. Lead with the material finding, then the evidence boundary, then the next evidence-gathering action.
- Every material sentence must do at least one job: interpret cited evidence, identify a contradiction, state a limit, or prescribe a measurable next check.
- Do not restate a score unless you explain what the retained evidence does and does not establish.
- Do not infer a strength from a score alone. A strength needs behavioral, answer-level, source-level, or judge-level evidence.
- Make each recommended action executable. Name the artifact or test to produce and the success condition.
- Use short, literal sentences. Remove throat-clearing, motivational filler, inflated adjectives, generic praise, and recruiter slogans.
- Do not use em dashes, rhetorical questions, fake quotations, or stock phrases such as holistic, robust, leverage, seamless, strong candidate, demonstrates strong, or overall performance.
- Do not expose private chain-of-thought. Return only concise conclusions and their traceable evidence.`;
  return kind === "dsa"
    ? `${shared}\nAnalyze algorithmic reasoning, executable correctness, source quality, edge cases, complexity claims, and follow-up reasoning. Passing tests are bounded evidence, not proof of universal correctness or optimality.`
    : `${shared}\nSynthesize every configured assessment module in the evidence (Aptitude, coding/DSA, SQL, and Placement Readiness interview where present) without averaging away contradictions. Explain what independently reinforces, what conflicts, which evidence remains missing, and the smallest panel action that resolves each material uncertainty.`;
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((current, part) => {
      if (Array.isArray(current)) {
        const index = Number(part);
        return Number.isInteger(index) ? current[index] : undefined;
      }
      return current && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined;
    }, root);
}

function scalarEvidenceText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean" || value === null) return String(value);
  return null;
}

function encodeJsonPointerPart(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function collectEvidenceScalars(
  value: unknown,
  pointer = "",
  rows: Array<{ pointer: string; value: string }> = [],
) {
  const scalar = scalarEvidenceText(value);
  if (scalar !== null && pointer) {
    rows.push({ pointer, value: scalar });
    return rows;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectEvidenceScalars(item, `${pointer}/${index}`, rows));
    return rows;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
      collectEvidenceScalars(item, `${pointer}/${encodeJsonPointerPart(key)}`, rows));
  }
  return rows;
}

function citationParts(reference: string) {
  const separator = reference.indexOf(" :: ");
  if (separator <= 0) return null;
  const pointer = reference.slice(0, separator).trim();
  const excerpt = reference.slice(separator + 4).trim();
  return pointer.startsWith("/") && excerpt ? { pointer, excerpt } : null;
}

function excerptMatches(actual: string, excerpt: string) {
  // Structured-output providers can normalize indentation and line endings in
  // copied source snippets. Treat whitespace-only changes as equivalent, then
  // canonicalize the stored citation back to the exact persisted scalar.
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const normalizedActual = normalize(actual);
  const normalizedExcerpt = normalize(excerpt);
  return normalizedActual === normalizedExcerpt || normalizedActual.includes(normalizedExcerpt);
}

function knownCitationPointerRepairs(pointer: string) {
  const candidates = [pointer];
  if (/\/interview\/latest\/report\/(recurringStrengths|recurringWeaknesses)\//.test(pointer)) {
    candidates.push(pointer.replace("/interview/latest/report/", "/interview/latest/report/scorecard/"));
  }
  return candidates;
}

export function canonicalizeAssessmentCitation(
  reference: string,
  evidence: unknown,
): string | null {
  const parsed = citationParts(reference);
  if (!parsed) return null;
  for (const pointer of knownCitationPointerRepairs(parsed.pointer)) {
    const source = scalarEvidenceText(resolveJsonPointer(evidence, pointer));
    if (source !== null && excerptMatches(source, parsed.excerpt))
      return `${pointer} :: ${source}`;
  }

  const requestedParts = parsed.pointer.split("/").filter(Boolean);
  const requestedSuffix = requestedParts.slice(-2).join("/");
  const matches = collectEvidenceScalars(evidence)
    .filter((row) => excerptMatches(row.value, parsed.excerpt))
    .map((row) => ({
      ...row,
      suffixMatch: row.pointer.split("/").filter(Boolean).slice(-2).join("/") === requestedSuffix,
    }));
  const suffixMatches = matches.filter((row) => row.suffixMatch);
  const candidates = suffixMatches.length ? suffixMatches : matches;
  if (candidates.length !== 1) return null;
  return `${candidates[0].pointer} :: ${candidates[0].value}`;
}

export function canonicalizeAssessmentReportCitations(
  result: unknown,
  evidence: unknown,
): unknown {
  if (Array.isArray(result))
    return result.map((item) => canonicalizeAssessmentReportCitations(item, evidence));
  if (!result || typeof result !== "object") return result;
  return Object.fromEntries(
    Object.entries(result as Record<string, unknown>).map(([key, value]) => {
      if (key === "evidence" && Array.isArray(value)) {
        return [
          key,
          value.map((reference) =>
            canonicalizeAssessmentCitation(String(reference), evidence) ?? String(reference)),
        ];
      }
      return [key, canonicalizeAssessmentReportCitations(value, evidence)];
    }),
  );
}

export function assessmentCitationCatalog(evidence: unknown, limit = 320) {
  return collectEvidenceScalars(evidence)
    .filter((row) => row.value.trim().length > 0 && row.value.length <= 500)
    .slice(0, limit)
    .map((row) => `${row.pointer} :: ${row.value}`);
}

export function assertGroundedAssessmentReport(
  result: unknown,
  evidence: unknown,
): void {
  const references: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (Array.isArray(row.evidence))
      references.push(...row.evidence.map(String));
    Object.values(row).forEach(visit);
  };
  visit(result);
  if (!references.length)
    throw new Error("Report rejected: no material claim has a source citation.");
  const invalid = references.filter((reference) => {
    const separator = reference.indexOf(" :: ");
    if (separator <= 0) return true;
    const pointer = reference.slice(0, separator).trim();
    const excerpt = reference.slice(separator + 4).trim();
    if (!excerpt) return true;
    const source = scalarEvidenceText(resolveJsonPointer(evidence, pointer));
    return source === null || source !== excerpt;
  });
  if (invalid.length)
    throw new Error(
      `Report rejected: ${invalid.length} evidence citation(s) do not resolve to the persisted source: ${invalid.slice(0, 5).join(" | ")}`,
    );
}

const FORBIDDEN_REPORT_PROSE =
  /\b(?:holistic|robust|leverage|seamless|world-class|strong candidate|demonstrates strong|overall performance)\b/i;

export function assertEditorialAssessmentReport(result: unknown): void {
  const violations: string[] = [];
  const visit = (value: unknown, path = "") => {
    if (typeof value === "string") {
      if (value.includes("—")) violations.push(`${path}: em dash`);
      const phrase = value.match(FORBIDDEN_REPORT_PROSE)?.[0];
      if (phrase) violations.push(`${path}: forbidden stock phrase "${phrase}"`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "evidence") continue;
      visit(item, `${path}/${key}`);
    }
  };
  visit(result);
  if (violations.length) {
    throw new Error(
      `Report rejected by editorial quality gate: ${violations.slice(0, 5).join(" | ")}`,
    );
  }
}

export async function callReportGenerationChain(
  kind: AssessmentReportKind,
  evidence: unknown,
  route = selectAssessmentReportModel(kind, evidence),
) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new WorkspaceServiceError("Report agent unavailable: configure OPENROUTER_API_KEY on the ProvenHire server.", 503);
  const citationCatalog = assessmentCitationCatalog(evidence);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://provenhire.in", "X-Title": "ProvenHire Assessment Reports" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: route.model,
      temperature: 0.1,
      max_tokens: 8000,
      reasoning: { effort: "high", exclude: true },
      provider: { require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: `${kind}_assessment_report`, strict: true, schema: jsonSchemaFor(kind) } },
      messages: [{ role: "system", content: systemPrompt(kind) }, { role: "user", content: `Persisted evidence JSON:\n${JSON.stringify(evidence)}\n\nCanonical scalar citation catalog (copy citations exactly from this list):\n${citationCatalog.join("\n")}` }],
    }),
  });
  const body = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> & { cost?: number } };
  if (!response.ok) throw new Error(body.error?.message || `OpenRouter report generation failed (${response.status})`);
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Report model returned an empty response.");
  let parsed = schemaFor(kind).parse(canonicalizeAssessmentReportCitations(
    JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")),
    evidence,
  ));
  assertGroundedAssessmentReport(parsed, evidence);

  const useCerebrasCritic =
    REPORT_CRITIC_PROVIDER === "cerebras" && Boolean(process.env.CEREBRAS_API_KEY?.trim());
  const criticApiKey = useCerebrasCritic
    ? process.env.CEREBRAS_API_KEY!.trim()
    : apiKey;
  const criticRequest: Record<string, unknown> = {
    model: REPORT_CRITIC_MODEL,
    temperature: 0,
    max_tokens: 10_000,
    response_format: { type: "json_schema", json_schema: { name: "assessment_report_critique", strict: true, schema: {
      type: "object", additionalProperties: false,
      properties: {
        approved: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
        requiredChanges: { type: "array", items: { type: "string" } },
      },
      required: ["approved", "issues", "requiredChanges"],
    } } },
    messages: [
      { role: "system", content: "You are the independent quality judge for an employment-assessment report. Do not reveal chain-of-thought. Return only the structured verdict. Reject unsupported claims, fake precision, unresolved citations, score averaging that hides contradictions, hiring recommendations, vague AI prose, generic praise, score restatement without interpretation, unmeasurable next steps, forbidden stock phrases, or failure to state evidence limits." },
      { role: "user", content: `Persisted evidence:\n${JSON.stringify(evidence)}\n\nDraft report:\n${JSON.stringify(parsed)}` },
    ],
  };
  if (useCerebrasCritic) {
    criticRequest.reasoning_effort = "high";
    criticRequest.reasoning_format = "hidden";
  } else {
    criticRequest.reasoning = { effort: "high", exclude: true };
    criticRequest.provider = { require_parameters: true, data_collection: "deny" };
  }
  type CriticBody = { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> & { cost?: number } };
  let criticBody: CriticBody = {};
  let criticContent = "";
  for (const [attemptIndex, effort] of ["high", "medium"].entries()) {
    const attemptRequest = { ...criticRequest };
    attemptRequest.max_tokens = attemptIndex === 0 ? 10_000 : 6000;
    if (useCerebrasCritic) attemptRequest.reasoning_effort = effort;
    else attemptRequest.reasoning = { effort, exclude: true };
    const criticResponse = await fetch(useCerebrasCritic
      ? "https://api.cerebras.ai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${criticApiKey}`,
        "Content-Type": "application/json",
        ...(useCerebrasCritic ? {} : { "HTTP-Referer": "https://provenhire.in", "X-Title": "ProvenHire Assessment Report Critic" }),
      },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify(attemptRequest),
    });
    criticBody = await criticResponse.json() as CriticBody;
    if (!criticResponse.ok) {
      if (attemptIndex === 1) throw new Error(criticBody.error?.message || `Report critic failed (${criticResponse.status})`);
      continue;
    }
    criticContent = criticBody.choices?.[0]?.message?.content?.trim() || "";
    if (criticContent) break;
  }
  if (!criticContent) throw new Error("Report critic exhausted its reasoning budget without returning a verdict.");
  let critique = z.object({ approved: z.boolean(), issues: z.array(z.string()), requiredChanges: z.array(z.string()) }).parse(JSON.parse(criticContent.replace(/^```json\s*|\s*```$/g, "")));
  try {
    assertEditorialAssessmentReport(parsed);
  } catch (error) {
    const issue = error instanceof Error ? error.message : "Editorial quality gate failed.";
    critique = {
      approved: false,
      issues: [...critique.issues, issue],
      requiredChanges: [
        ...critique.requiredChanges,
        "Rewrite the flagged prose using short, literal, evidence-led language.",
      ],
    };
  }

  let revisionUsage: Record<string, unknown> = {};
  let revisionCost = 0;
  if (!critique.approved) {
    const revisionResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://provenhire.in", "X-Title": "ProvenHire Assessment Report Revision" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: route.model,
        temperature: 0.05,
        max_tokens: 8000,
        reasoning: { effort: "high", exclude: true },
        provider: { require_parameters: true },
        response_format: { type: "json_schema", json_schema: { name: `${kind}_assessment_report_revision`, strict: true, schema: jsonSchemaFor(kind) } },
        messages: [
          { role: "system", content: `${systemPrompt(kind)}\nRevise the draft to address every critic requirement. Return the complete corrected report only.` },
          { role: "user", content: `Persisted evidence:\n${JSON.stringify(evidence)}\n\nDraft:\n${JSON.stringify(parsed)}\n\nCritic issues:\n${JSON.stringify(critique)}` },
        ],
      }),
    });
    const revisionBody = await revisionResponse.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> & { cost?: number } };
    if (!revisionResponse.ok) throw new Error(revisionBody.error?.message || `Report revision failed (${revisionResponse.status})`);
    const revisionContent = revisionBody.choices?.[0]?.message?.content?.trim();
    if (!revisionContent) throw new Error("Report revision returned an empty response.");
    parsed = schemaFor(kind).parse(canonicalizeAssessmentReportCitations(
      JSON.parse(revisionContent.replace(/^```json\s*|\s*```$/g, "")),
      evidence,
    ));
    assertGroundedAssessmentReport(parsed, evidence);
    revisionUsage = revisionBody.usage ?? {};
    revisionCost = Number(revisionBody.usage?.cost ?? 0) || 0;
  }
  assertEditorialAssessmentReport(parsed);
  return {
    result: parsed,
    usage: {
      draft: body.usage ?? {},
      critic: criticBody.usage ?? {},
      revision: revisionUsage,
      critique,
      routing: route,
    },
    estimatedCostUsd:
      (Number(body.usage?.cost ?? 0) || 0) +
      (Number(criticBody.usage?.cost ?? 0) || 0) +
      revisionCost,
  };
}

export async function generateAssessmentReport(actor: WorkspaceActor, workspaceId: string, userId: string, kind: AssessmentReportKind, force = false) {
  const dossier = await getWorkspaceCandidateDossier(actor, workspaceId, userId);
  if (dossier.synthesis.decisionStatus !== "human_review_required")
    throw new WorkspaceServiceError(
      "Report generation is blocked until every source module has complete, auditable evidence.",
      409,
    );
  const evidence = assessmentEvidenceFor(kind, dossier);
  const sourceHash = assessmentEvidenceHash(kind, dossier);
  const route = selectAssessmentReportModel(kind, evidence);
  if (!force) {
    const cached = await prisma.assessmentReportGeneration.findFirst({ where: { workspaceId, userId, reportKind: kind, sourceHash, promptVersion: REPORT_AGENT_PROMPT_VERSION, model: route.model, status: "complete" }, orderBy: { completedAt: "desc" } });
    if (cached) return cached;
  }
  const generation = await prisma.assessmentReportGeneration.upsert({
    where: { workspaceId_userId_reportKind_sourceHash_promptVersion_model: { workspaceId, userId, reportKind: kind, sourceHash, promptVersion: REPORT_AGENT_PROMPT_VERSION, model: route.model } },
    create: { workspaceId, userId, reportKind: kind, sourceHash, promptVersion: REPORT_AGENT_PROMPT_VERSION, model: route.model, status: "pending" },
    update: { status: "pending", error: null, startedAt: new Date(), completedAt: null },
  });
  try {
    const output = await callReportGenerationChain(kind, evidence, route);
    return await prisma.assessmentReportGeneration.update({
      where: { id: generation.id },
      data: {
        status: "complete",
        result: output.result as unknown as Prisma.InputJsonValue,
        usage: output.usage as Prisma.InputJsonValue,
        estimatedCostUsd: output.estimatedCostUsd,
        error: null,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.assessmentReportGeneration.update({ where: { id: generation.id }, data: { status: "error", error: error instanceof Error ? error.message : String(error), completedAt: new Date() } });
    throw error;
  }
}
