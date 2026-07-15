import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../config/prisma.js";
import { WorkspaceServiceError } from "./workspace.service.js";
import { getWorkspaceCandidateDossier, type WorkspaceActor } from "./workspaceRegistration.service.js";

export const REPORT_AGENT_PROMPT_VERSION = "assessment_report_agents_v1";
export const REPORT_AGENT_MODEL = process.env.REPORT_AGENT_MODEL?.trim() || "deepseek/deepseek-r1";

const citation = z.object({
  claim: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  confidence: z.enum(["high", "medium", "low"]),
});

export const dsaAgentReportSchema = z.object({
  schemaVersion: z.literal("dsa_reasoning_report_v1"),
  executiveRead: z.string().min(1),
  decisionSignal: z.enum(["strong", "mixed", "weak", "insufficient_evidence"]),
  confidence: z.number().min(0).max(1),
  algorithmicReasoning: z.string().min(1),
  implementationQuality: z.string().min(1),
  correctnessBoundary: z.string().min(1),
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
  })),
  roleReadiness: z.object({
    readyFor: z.array(z.string()),
    needsSupportFor: z.array(z.string()),
    avoidUntilVerified: z.array(z.string()),
  }),
  recommendedPanelProbes: z.array(z.string()),
  evidenceLimits: z.array(z.string()),
});

export const unifiedAgentReportSchema = z.object({
  schemaVersion: z.literal("unified_reasoning_report_v1"),
  recommendation: z.enum(["advance", "advance_with_follow_up", "hold", "insufficient_evidence"]),
  confidence: z.number().min(0).max(1),
  executiveRead: z.string().min(1),
  crossModuleThesis: z.string().min(1),
  reinforcingSignals: z.array(citation),
  contradictions: z.array(citation),
  riskRegister: z.array(z.object({
    risk: z.string().min(1),
    severity: z.enum(["high", "medium", "low"]),
    evidence: z.array(z.string()),
    resolution: z.string().min(1),
  })),
  roleFit: z.object({
    readyNow: z.array(z.string()),
    conditional: z.array(z.string()),
    notYetProven: z.array(z.string()),
  }),
  panelDecisionGuide: z.array(z.string()),
  evidenceLimits: z.array(z.string()),
});

export type AssessmentReportKind = "dsa" | "unified";

function schemaFor(kind: AssessmentReportKind) {
  return kind === "dsa" ? dsaAgentReportSchema : unifiedAgentReportSchema;
}

function jsonSchemaFor(kind: AssessmentReportKind): Record<string, unknown> {
  const citationProperties = {
    claim: { type: "string" },
    evidence: { type: "array", items: { type: "string" }, minItems: 1 },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  };
  if (kind === "dsa") return {
    type: "object", additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", const: "dsa_reasoning_report_v1" },
      executiveRead: { type: "string" }, decisionSignal: { type: "string", enum: ["strong", "mixed", "weak", "insufficient_evidence"] }, confidence: { type: "number", minimum: 0, maximum: 1 },
      algorithmicReasoning: { type: "string" }, implementationQuality: { type: "string" }, correctnessBoundary: { type: "string" },
      verifiedStrengths: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "confidence"] } },
      failureAndRiskAnalysis: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "confidence"] } },
      problemReads: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, correctness: { type: "string" }, approach: { type: "string" }, complexity: { type: "string" }, codeQuality: { type: "string" }, edgeCaseRead: { type: "string" }, followUpReasoning: { type: "string" } }, required: ["title", "correctness", "approach", "complexity", "codeQuality", "edgeCaseRead", "followUpReasoning"] } },
      roleReadiness: { type: "object", additionalProperties: false, properties: { readyFor: { type: "array", items: { type: "string" } }, needsSupportFor: { type: "array", items: { type: "string" } }, avoidUntilVerified: { type: "array", items: { type: "string" } } }, required: ["readyFor", "needsSupportFor", "avoidUntilVerified"] },
      recommendedPanelProbes: { type: "array", items: { type: "string" } }, evidenceLimits: { type: "array", items: { type: "string" } },
    },
    required: ["schemaVersion", "executiveRead", "decisionSignal", "confidence", "algorithmicReasoning", "implementationQuality", "correctnessBoundary", "verifiedStrengths", "failureAndRiskAnalysis", "problemReads", "roleReadiness", "recommendedPanelProbes", "evidenceLimits"],
  };
  return {
    type: "object", additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", const: "unified_reasoning_report_v1" }, recommendation: { type: "string", enum: ["advance", "advance_with_follow_up", "hold", "insufficient_evidence"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, executiveRead: { type: "string" }, crossModuleThesis: { type: "string" },
      reinforcingSignals: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "confidence"] } }, contradictions: { type: "array", items: { type: "object", additionalProperties: false, properties: citationProperties, required: ["claim", "evidence", "confidence"] } },
      riskRegister: { type: "array", items: { type: "object", additionalProperties: false, properties: { risk: { type: "string" }, severity: { type: "string", enum: ["high", "medium", "low"] }, evidence: { type: "array", items: { type: "string" } }, resolution: { type: "string" } }, required: ["risk", "severity", "evidence", "resolution"] } },
      roleFit: { type: "object", additionalProperties: false, properties: { readyNow: { type: "array", items: { type: "string" } }, conditional: { type: "array", items: { type: "string" } }, notYetProven: { type: "array", items: { type: "string" } } }, required: ["readyNow", "conditional", "notYetProven"] },
      panelDecisionGuide: { type: "array", items: { type: "string" } }, evidenceLimits: { type: "array", items: { type: "string" } },
    },
    required: ["schemaVersion", "recommendation", "confidence", "executiveRead", "crossModuleThesis", "reinforcingSignals", "contradictions", "riskRegister", "roleFit", "panelDecisionGuide", "evidenceLimits"],
  };
}

function evidenceFor(kind: AssessmentReportKind, dossier: Awaited<ReturnType<typeof getWorkspaceCandidateDossier>>) {
  const base = { candidate: dossier.candidate, registration: dossier.registration, deterministicSynthesis: dossier.synthesis };
  if (kind === "dsa") return { ...base, dsa: dossier.modules.dsa };
  return {
    ...base,
    aptitude: dossier.modules.aptitude,
    dsa: dossier.modules.dsa,
    antigravity: dossier.modules.antigravity.latest ? {
      overallScore: dossier.modules.antigravity.latest.overallScore,
      hireRecommendation: dossier.modules.antigravity.latest.hireRecommendation,
      confidenceScore: dossier.modules.antigravity.latest.confidenceScore,
      report: dossier.modules.antigravity.latest.report,
      evidencePacket: dossier.modules.antigravity.latest.evidencePacket,
    } : null,
  };
}

function systemPrompt(kind: AssessmentReportKind): string {
  const shared = `You are a senior hiring-evidence analyst. Produce a decision-useful report from the supplied persisted evidence only. Never invent a score, test, answer, behavior, responsibility, or claim. Distinguish verified facts from inference. Every important conclusion must cite concrete evidence strings that a recruiter can locate in the input. Treat missing evidence as a limit, not as a negative fact. Avoid generic praise and avoid repeating raw metrics without interpretation.`;
  return kind === "dsa"
    ? `${shared}\nAnalyze algorithmic reasoning, executable correctness, source quality, edge cases, complexity claims, and follow-up reasoning. Passing tests are bounded evidence, not proof of universal correctness or optimality.`
    : `${shared}\nSynthesize Aptitude, DSA, and Antigravity without averaging away contradictions. Explain what independently reinforces, what conflicts, what is role-ready, and the smallest panel action that resolves each material uncertainty.`;
}

async function callOpenRouter(kind: AssessmentReportKind, evidence: unknown) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new WorkspaceServiceError("Report agent unavailable: configure OPENROUTER_API_KEY on the ProvenHire server.", 503);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://provenhire.in", "X-Title": "ProvenHire Assessment Reports" },
    body: JSON.stringify({
      model: REPORT_AGENT_MODEL,
      temperature: 0.1,
      max_tokens: 6000,
      reasoning: { effort: "high", exclude: true },
      provider: { require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: `${kind}_assessment_report`, strict: true, schema: jsonSchemaFor(kind) } },
      messages: [{ role: "system", content: systemPrompt(kind) }, { role: "user", content: `Persisted evidence JSON:\n${JSON.stringify(evidence)}` }],
    }),
  });
  const body = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }>; usage?: Record<string, unknown> & { cost?: number } };
  if (!response.ok) throw new Error(body.error?.message || `OpenRouter report generation failed (${response.status})`);
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Report model returned an empty response.");
  const parsed = schemaFor(kind).parse(JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")));
  return { result: parsed, usage: body.usage ?? {}, estimatedCostUsd: Number(body.usage?.cost ?? 0) || null };
}

export async function generateAssessmentReport(actor: WorkspaceActor, workspaceId: string, userId: string, kind: AssessmentReportKind, force = false) {
  const dossier = await getWorkspaceCandidateDossier(actor, workspaceId, userId);
  const evidence = evidenceFor(kind, dossier);
  const sourceHash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  if (!force) {
    const cached = await prisma.assessmentReportGeneration.findFirst({ where: { workspaceId, userId, reportKind: kind, sourceHash, promptVersion: REPORT_AGENT_PROMPT_VERSION, model: REPORT_AGENT_MODEL, status: "complete" }, orderBy: { completedAt: "desc" } });
    if (cached) return cached;
  }
  const generation = await prisma.assessmentReportGeneration.upsert({
    where: { workspaceId_userId_reportKind_sourceHash_promptVersion_model: { workspaceId, userId, reportKind: kind, sourceHash, promptVersion: REPORT_AGENT_PROMPT_VERSION, model: REPORT_AGENT_MODEL } },
    create: { workspaceId, userId, reportKind: kind, sourceHash, promptVersion: REPORT_AGENT_PROMPT_VERSION, model: REPORT_AGENT_MODEL, status: "pending" },
    update: { status: "pending", error: null, startedAt: new Date(), completedAt: null },
  });
  try {
    const output = await callOpenRouter(kind, evidence);
    return await prisma.assessmentReportGeneration.update({ where: { id: generation.id }, data: { status: "complete", result: output.result as unknown as Prisma.InputJsonValue, usage: output.usage as Prisma.InputJsonValue, estimatedCostUsd: output.estimatedCostUsd, completedAt: new Date() } });
  } catch (error) {
    await prisma.assessmentReportGeneration.update({ where: { id: generation.id }, data: { status: "error", error: error instanceof Error ? error.message : String(error), completedAt: new Date() } });
    throw error;
  }
}
