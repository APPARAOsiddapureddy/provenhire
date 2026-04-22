/**
 * Unified Candidate Performance Pipeline
 *
 * Any module calls publishRunResult() with a rich meta payload after finalizing.
 * getCandidateContext() returns a snapshot — normalized scores + structured weakness/
 * strength map + a ready-to-inject LLM context string — that any module can pull
 * before starting a session to tailor its probing strategy.
 *
 * Push contract: push everything you know. Raw skill confidences, per-dimension scores,
 * failure surfaces, credibility flags, claimed-but-unverified skills.
 * Pull contract: getCandidateContext() distills the latest snapshot per candidate.
 * Downstream modules decide which parts are relevant to them.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === null ? null : toPrismaJsonValue(item))) as Prisma.InputJsonArray;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, item === null ? null : toPrismaJsonValue(item)] as const);
    return Object.fromEntries(entries) as Prisma.InputJsonObject;
  }
  return String(value);
}

// ─── Module-specific meta shapes ─────────────────────────────────────────────

export interface DsaMeta {
  track?: string;
  answers?: unknown;
}

export interface AiSkillsMeta {
  track: string;
  threshold: number;
  skillsChecked: Record<string, number>;        // skill → confidence 0-100
  resumeSkills: string[];                        // claimed on resume
  verifiedSkills: Array<{ skill: string; confidence: number }>;
  belowThresholdSkills: Array<{ skill: string; confidence: number }>;
  dsaWalkthroughScores: number[];
  dsaAvg: number;
  skillAvg: number;
  timeExpired: boolean;
}

export interface SystemDesignMeta {
  lldScore: number;
  hldScore: number;
  summary?: string;
}

export interface AntigravityMeta {
  badge: string | null;
  hireRecommendation: string | null;
  confidenceScore: number | null;
  summary: string | null;
  breakdown: Record<string, number | string>;   // reasoning, technical_depth, communication, adaptability
  failureSurface: Record<string, number>;        // domain → 0.0-1.0 failure probability
  strengths: string[];
  riskFlags: string[];
  claimCredibilityRisk: { level: string; detail: string } | null;
  untestedDimensions: string[];
  weaknessSummary: Record<string, number>;       // weakness type → count
  rawWeaknesses: Array<{ weakness: string; type: string; severity: string; attack_strategy?: string }>;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type Module =
  | "dsa"
  | "data_round"
  | "ai_skills"
  | "system_design_data"
  | "system_design_software"
  | "antigravity";

export type Competency =
  | "LIVE_CODING"
  | "AI_SKILLS"
  | "SYSTEM_DESIGN_LLD"
  | "SYSTEM_DESIGN_HLD"
  | "EXPERT_INTERVIEW";

export interface RunSignal {
  competency: Competency;
  score: number;
  pass: boolean;
  events?: Array<{
    eventType: string;
    value?: number;
    detail?: Record<string, unknown>;
  }>;
}

export interface RunResult {
  module: Module;
  status: "completed" | "failed" | "invalidated";
  score: number | null;
  pass: boolean;
  track?: string;
  targetRole?: string;
  meta?: DsaMeta | AiSkillsMeta | SystemDesignMeta | AntigravityMeta | Record<string, unknown>;
  signals: RunSignal[];
}

export interface CandidateContext {
  dsaScore: number | null;
  aiSkillsScore: number | null;
  systemDesignScore: number | null;
  antigravityScore: number | null;
  verifiedCompetencies: Array<{ competency: string; score: number; pass: boolean }>;
  modules: SnapshotModules;
  stressTestTargets: StressTestTarget[];
  contextSummary: string;
  priorContextForLLM: string;
  state: CandidateContextState;
}

interface StressTestTarget {
  area: string;
  reason: string;
  severity: "high" | "medium" | "low";
  source: Module;
}

interface SnapshotModules {
  dsa?: { score: number | null; pass: boolean; track?: string };
  data_round?: { score: number | null; pass: boolean; track?: string };
  ai_skills?: {
    score: number | null;
    pass: boolean;
    verifiedSkills: Array<{ skill: string; confidence: number }>;
    belowThresholdSkills: Array<{ skill: string; confidence: number }>;
    claimedNotVerified: string[];
    dsaWalkthroughScores: number[];
    dsaAvg: number;
    skillAvg: number;
  };
  system_design?: {
    score: number | null;
    pass: boolean;
    track: "software" | "data";
    lldScore: number;
    hldScore: number;
    summary?: string;
    weakDimension: "lld" | "hld" | "both" | "none";
  };
  antigravity?: {
    score: number | null;
    pass: boolean;
    hireRecommendation: string | null;
    breakdown: Record<string, number | string>;
    failureSurface: Record<string, number>;
    strengths: string[];
    riskFlags: string[];
    claimCredibilityRisk: { level: string; detail: string } | null;
    untestedDimensions: string[];
    topWeaknesses: Array<{ type: string; count: number }>;
  };
}

export interface CandidateContextRiskSignal {
  category: string;
  detail: string;
  severity: "high" | "medium" | "low";
  source: Module | "state";
}

export interface CandidateContextState {
  version: 2;
  generatedAt: string;
  candidate: {
    userId: string;
    aggregateScores: {
      dsa: number | null;
      dataRound: number | null;
      aiSkills: number | null;
      systemDesign: number | null;
      antigravity: number | null;
    };
    verifiedCompetencies: Array<{ competency: string; score: number; pass: boolean }>;
  };
  modules: {
    dsa?: SnapshotModules["dsa"];
    dataRound?: SnapshotModules["data_round"];
    aiSkills?: SnapshotModules["ai_skills"];
    systemDesign?: SnapshotModules["system_design"];
    antigravity?: SnapshotModules["antigravity"];
  };
  competencies: Record<string, { score: number; pass: boolean; source: string; capturedAt: string }>;
  probeTargets: StressTestTarget[];
  riskSignals: CandidateContextRiskSignal[];
  overview: {
    summary: string;
    llmContext: string;
  };
}

export type DownstreamModule = "overview" | "antigravity" | "ai_skills" | "system_design";

export interface ModuleContextBundle {
  targetModule: DownstreamModule;
  summary: string;
  promptContext: string;
  relevantState: Record<string, unknown>;
}

// ─── Write path ───────────────────────────────────────────────────────────────

export async function publishRunResult(userId: string, result: RunResult): Promise<string> {
  const lastRun = await prisma.candidateAssessmentRun.findFirst({
    where: { userId, module: result.module },
    orderBy: { runIndex: "desc" },
    select: { runIndex: true },
  });
  const runIndex = (lastRun?.runIndex ?? 0) + 1;

  const run = await prisma.candidateAssessmentRun.create({
    data: {
      userId,
      module: result.module,
      runIndex,
      status: result.status,
      score: result.score ?? undefined,
      pass: result.pass,
      track: result.track,
      targetRole: result.targetRole,
      meta: toPrismaJsonValue(result.meta ?? {}),
    },
  });

  for (const sig of result.signals) {
    await prisma.candidatePerformanceSignal.create({
      data: {
        userId,
        runId: run.id,
        competency: sig.competency,
        score: sig.score,
        pass: sig.pass,
        source: result.module,
      },
    });

    for (const ev of sig.events ?? []) {
      await prisma.candidateAssessmentEvent.create({
        data: {
          runId: run.id,
          userId,
          eventType: ev.eventType,
          competency: sig.competency,
          value: ev.value,
          detail: toPrismaJsonValue(ev.detail ?? {}),
        },
      });
    }
  }

  await _regenerateSnapshot(userId);
  return run.id;
}

// ─── Read path ────────────────────────────────────────────────────────────────

export async function getCandidateContext(userId: string): Promise<CandidateContext> {
  const snapshot = await prisma.candidatePerformanceSnapshot.findUnique({
    where: { userId },
  });

  if (!snapshot) return _emptyContext();

  const blob = snapshot.contextBlob as Record<string, unknown>;
  const modules = (blob.modules as SnapshotModules) ?? {};
  const stressTestTargets = (blob.stressTestTargets as StressTestTarget[]) ?? [];
  const contextSummary = typeof blob.summary === "string" ? blob.summary : "";
  const priorContextForLLM =
    typeof blob.priorContextForLLM === "string" ? blob.priorContextForLLM : "";
  const state = _hydrateStateFromSnapshot(
    userId,
    snapshot,
    modules,
    stressTestTargets,
    contextSummary,
    priorContextForLLM,
    blob.state
  );
  return {
    dsaScore: snapshot.dsaScore,
    aiSkillsScore: snapshot.aiSkillsScore,
    systemDesignScore: snapshot.systemDesignScore,
    antigravityScore: snapshot.antigravityScore,
    verifiedCompetencies: (snapshot.verifiedCompetencies as Array<{ competency: string; score: number; pass: boolean }>) ?? [],
    modules,
    stressTestTargets,
    contextSummary,
    priorContextForLLM,
    state,
  };
}

export async function getCandidateModuleContext(
  userId: string,
  targetModule: DownstreamModule
): Promise<ModuleContextBundle> {
  const context = await getCandidateContext(userId);
  return buildRelevantModuleContext(context.state, targetModule);
}

export function buildRelevantModuleContext(
  state: CandidateContextState,
  targetModule: DownstreamModule
): ModuleContextBundle {
  switch (targetModule) {
    case "antigravity":
      return _buildAntigravityContext(state);
    case "ai_skills":
      return _buildAiSkillsContext(state);
    case "system_design":
      return _buildSystemDesignContext(state);
    case "overview":
    default:
      return {
        targetModule: "overview",
        summary: state.overview.summary,
        promptContext: state.overview.llmContext,
        relevantState: {
          aggregateScores: state.candidate.aggregateScores,
          modules: state.modules,
          probeTargets: state.probeTargets,
          riskSignals: state.riskSignals,
        },
      };
  }
}

// ─── Snapshot regeneration ────────────────────────────────────────────────────

type RawSignal = {
  competency: string;
  score: number;
  pass: boolean;
  source: string;
  capturedAt: Date;
};

type RunRow = {
  id: string;
  module: string;
  score: number | null;
  pass: boolean | null;
  track: string | null;
  meta: unknown;
  completedAt: Date;
};

async function _regenerateSnapshot(userId: string): Promise<void> {
  // Latest signal per competency
  const signals = await prisma.$queryRaw<RawSignal[]>`
    SELECT DISTINCT ON (competency) competency, score, pass, source, "capturedAt"
    FROM "CandidatePerformanceSignal"
    WHERE "userId" = ${userId}
    ORDER BY competency, "capturedAt" DESC
  `;

  // Latest completed run per module (for rich meta)
  const latestRuns = await prisma.$queryRaw<RunRow[]>`
    SELECT DISTINCT ON (module) id, module, score, pass, track, meta, "completedAt"
    FROM "CandidateAssessmentRun"
    WHERE "userId" = ${userId} AND status IN ('completed', 'failed')
    ORDER BY module, "completedAt" DESC
  `;

  const byComp = Object.fromEntries(signals.map((s) => [s.competency, s]));
  const byModule = Object.fromEntries(latestRuns.map((r) => [r.module, r]));

  const legacyLiveCoding = byComp["LIVE_CODING"]?.score ?? null;
  const dsaScore =
    byModule["dsa"]?.track === "data" && !byModule["data_round"] ? null : legacyLiveCoding;
  const aiSkillsScore = byComp["AI_SKILLS"]?.score ?? null;
  const sdHld = byComp["SYSTEM_DESIGN_HLD"]?.score ?? null;
  const sdLld = byComp["SYSTEM_DESIGN_LLD"]?.score ?? null;
  const systemDesignScore =
    sdHld != null && sdLld != null
      ? Math.round((sdHld + sdLld) / 2)
      : sdHld ?? sdLld ?? null;
  const antigravityScore = byComp["EXPERT_INTERVIEW"]?.score ?? null;

  const verifiedCompetencies = signals
    .filter((s) => s.pass)
    .map((s) => ({ competency: s.competency, score: s.score, pass: s.pass }));

  // Build structured module data
  const modules = _buildModules(byModule, { sdHld, sdLld });

  // Derive stress-test targets
  const stressTestTargets = _deriveStressTestTargets(modules);

  const summary = _buildSummary({
    dsaScore,
    dataRoundScore: modules.data_round?.score ?? null,
    aiSkillsScore,
    systemDesignScore,
    antigravityScore,
    byComp,
  });
  const priorContextForLLM = _buildLLMContext({
    dsaScore, aiSkillsScore, systemDesignScore, antigravityScore,
    modules, stressTestTargets, byComp,
  });
  const state = _buildCandidateState(
    userId,
    modules,
    signals,
    stressTestTargets,
    {
      dsaScore,
      dataRoundScore: modules.data_round?.score ?? null,
      aiSkillsScore,
      systemDesignScore,
      antigravityScore,
      summary,
      priorContextForLLM,
    }
  );

  await prisma.candidatePerformanceSnapshot.upsert({
    where: { userId },
    create: {
      userId,
      dsaScore,
      aiSkillsScore,
      systemDesignScore,
      antigravityScore,
      verifiedCompetencies: toPrismaJsonValue(verifiedCompetencies),
      contextBlob: toPrismaJsonValue({ summary, priorContextForLLM, modules, stressTestTargets, state }),
    },
    update: {
      dsaScore,
      aiSkillsScore,
      systemDesignScore,
      antigravityScore,
      verifiedCompetencies: toPrismaJsonValue(verifiedCompetencies),
      contextBlob: toPrismaJsonValue({ summary, priorContextForLLM, modules, stressTestTargets, state }),
    },
  });
}

function _buildModules(
  byModule: Record<string, RunRow>,
  scores: { sdHld: number | null; sdLld: number | null },
): SnapshotModules {
  const result: SnapshotModules = {};

  // DSA
  const dsaRun = byModule["dsa"];
  if (dsaRun && dsaRun.track !== "data") {
    result.dsa = {
      score: dsaRun.score,
      pass: dsaRun.pass ?? false,
      track: dsaRun.track ?? undefined,
    };
  }

  const dataRun = byModule["data_round"] ?? (dsaRun?.track === "data" ? dsaRun : undefined);
  if (dataRun) {
    result.data_round = {
      score: dataRun.score,
      pass: dataRun.pass ?? false,
      track: dataRun.track ?? "data",
    };
  }

  // AI Skills
  const aiRun = byModule["ai_skills"];
  if (aiRun) {
    const m = aiRun.meta as Partial<AiSkillsMeta> | null;
    result.ai_skills = {
      score: aiRun.score,
      pass: aiRun.pass ?? false,
      verifiedSkills: m?.verifiedSkills ?? [],
      belowThresholdSkills: m?.belowThresholdSkills ?? [],
      claimedNotVerified: (m?.resumeSkills ?? []).filter((s) =>
        !(m?.verifiedSkills ?? []).some((v) => v.skill === s)
      ),
      dsaWalkthroughScores: m?.dsaWalkthroughScores ?? [],
      dsaAvg: m?.dsaAvg ?? 0,
      skillAvg: m?.skillAvg ?? 0,
    };
  }

  // System Design — coalesce data + software into one entry (latest wins)
  const sdDataRun = byModule["system_design_data"];
  const sdSoftRun = byModule["system_design_software"];
  const sdRun = (sdDataRun && sdSoftRun)
    ? (sdDataRun.completedAt > sdSoftRun.completedAt ? sdDataRun : sdSoftRun)
    : sdDataRun ?? sdSoftRun;
  if (sdRun) {
    const m = sdRun.meta as Partial<SystemDesignMeta> | null;
    const lld = m?.lldScore ?? 0;
    const hld = m?.hldScore ?? 0;
    const weakDimension: "lld" | "hld" | "both" | "none" =
      lld < 60 && hld < 60 ? "both" : lld < 60 ? "lld" : hld < 60 ? "hld" : "none";
    result.system_design = {
      score: sdRun.score,
      pass: sdRun.pass ?? false,
      track: sdRun.module === "system_design_data" ? "data" : "software",
      lldScore: lld,
      hldScore: hld,
      summary: m?.summary,
      weakDimension,
    };
  }

  // Antigravity
  const agRun = byModule["antigravity"];
  if (agRun) {
    const m = agRun.meta as Partial<AntigravityMeta> | null;
    const weaknessSummary = m?.weaknessSummary ?? {};
    const topWeaknesses = Object.entries(weaknessSummary)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
    result.antigravity = {
      score: agRun.score,
      pass: agRun.pass ?? false,
      hireRecommendation: m?.hireRecommendation ?? null,
      breakdown: m?.breakdown ?? {},
      failureSurface: m?.failureSurface ?? {},
      strengths: m?.strengths ?? [],
      riskFlags: m?.riskFlags ?? [],
      claimCredibilityRisk: m?.claimCredibilityRisk ?? null,
      untestedDimensions: m?.untestedDimensions ?? [],
      topWeaknesses,
    };
  }

  return result;
}

function _deriveStressTestTargets(modules: SnapshotModules): StressTestTarget[] {
  const targets: StressTestTarget[] = [];

  // Skills claimed on resume but below threshold in AI Skills
  if (modules.ai_skills) {
    for (const s of modules.ai_skills.belowThresholdSkills) {
      const inClaimed = modules.ai_skills.claimedNotVerified.includes(s.skill);
      targets.push({
        area: s.skill,
        reason: `${inClaimed ? "Claimed on resume but" : "Tested and"} only ${s.confidence}% confidence — below verification threshold`,
        severity: s.confidence < 40 ? "high" : "medium",
        source: "ai_skills",
      });
    }
    // DSA walkthrough weak spots
    if (modules.ai_skills.dsaAvg < 60) {
      targets.push({
        area: "DSA reasoning / code walkthrough",
        reason: `Avg DSA walkthrough score ${modules.ai_skills.dsaAvg}% — struggled to explain own code`,
        severity: modules.ai_skills.dsaAvg < 40 ? "high" : "medium",
        source: "ai_skills",
      });
    }
  }

  // System design weak dimension
  if (modules.system_design) {
    const sd = modules.system_design;
    if (sd.weakDimension === "hld" || sd.weakDimension === "both") {
      targets.push({
        area: "High-level system design (HLD)",
        reason: `HLD score ${sd.hldScore}/100 — below passing bar${sd.summary ? `: "${sd.summary.slice(0, 80)}"` : ""}`,
        severity: sd.hldScore < 40 ? "high" : "medium",
        source: sd.track === "data" ? "system_design_data" : "system_design_software",
      });
    }
    if (sd.weakDimension === "lld" || sd.weakDimension === "both") {
      targets.push({
        area: "Low-level system design (LLD)",
        reason: `LLD score ${sd.lldScore}/100 — below passing bar`,
        severity: sd.lldScore < 40 ? "high" : "medium",
        source: sd.track === "data" ? "system_design_data" : "system_design_software",
      });
    }
  }

  // Antigravity failure surface (domains where failure prob > 0.5)
  if (modules.antigravity) {
    const ag = modules.antigravity;
    for (const [domain, failureProb] of Object.entries(ag.failureSurface)) {
      if (failureProb >= 0.5) {
        targets.push({
          area: domain,
          reason: `Antigravity failure surface ${Math.round(failureProb * 100)}% failure probability on this domain`,
          severity: failureProb >= 0.75 ? "high" : "medium",
          source: "antigravity",
        });
      }
    }
    // Risk flags from Antigravity
    for (const flag of ag.riskFlags.slice(0, 3)) {
      targets.push({
        area: "Risk flag",
        reason: flag,
        severity: "medium",
        source: "antigravity",
      });
    }
    // Credibility risk
    if (ag.claimCredibilityRisk && ag.claimCredibilityRisk.level !== "low" && ag.claimCredibilityRisk.level !== "not_tested") {
      targets.push({
        area: "Claim credibility",
        reason: ag.claimCredibilityRisk.detail,
        severity: ag.claimCredibilityRisk.level === "high" ? "high" : "medium",
        source: "antigravity",
      });
    }
  }

  return targets.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

function _buildSummary(args: {
  dsaScore: number | null;
  dataRoundScore?: number | null;
  aiSkillsScore: number | null;
  systemDesignScore: number | null;
  antigravityScore: number | null;
  byComp: Record<string, RawSignal>;
}): string {
  const { dsaScore, dataRoundScore, aiSkillsScore, systemDesignScore, antigravityScore, byComp } = args;
  const parts: string[] = [];
  if (dataRoundScore != null) {
    parts.push(`Data Round ${dataRoundScore}/100 (${byComp["LIVE_CODING"]?.pass ? "PASS" : "FAIL"})`);
  } else if (dsaScore != null) {
    parts.push(`DSA ${dsaScore}/100 (${byComp["LIVE_CODING"]?.pass ? "PASS" : "FAIL"})`);
  }
  if (aiSkillsScore != null) parts.push(`AI Skills ${aiSkillsScore}/100 (${byComp["AI_SKILLS"]?.pass ? "PASS" : "FAIL"})`);
  if (systemDesignScore != null) {
    const sdPass = byComp["SYSTEM_DESIGN_HLD"]?.pass || byComp["SYSTEM_DESIGN_LLD"]?.pass;
    parts.push(`System Design ${systemDesignScore}/100 (${sdPass ? "PASS" : "FAIL"})`);
  }
  if (antigravityScore != null) parts.push(`Expert Interview ${antigravityScore}/100 (${byComp["EXPERT_INTERVIEW"]?.pass ? "PASS" : "FAIL"})`);
  return parts.length ? parts.join(" | ") : "No prior assessments.";
}

function _buildLLMContext(args: {
  dsaScore: number | null;
  aiSkillsScore: number | null;
  systemDesignScore: number | null;
  antigravityScore: number | null;
  modules: SnapshotModules;
  stressTestTargets: StressTestTarget[];
  byComp: Record<string, RawSignal>;
}): string {
  const { dsaScore, aiSkillsScore, systemDesignScore, antigravityScore, modules, stressTestTargets, byComp } = args;
  const lines: string[] = ["=== Candidate Prior Assessment History ==="];

  // DSA
  if (modules.data_round) {
    lines.push(`\nData Round / Applied Coding: ${modules.data_round.score ?? "N/A"}/100 — ${modules.data_round.pass ? "PASSED" : "DID NOT PASS"}`);
  } else if (dsaScore != null) {
    const track = modules.dsa?.track ?? "";
    lines.push(`\nDSA / Live Coding: ${dsaScore}/100 — ${byComp["LIVE_CODING"]?.pass ? "PASSED" : "DID NOT PASS"}${track ? ` (${track} track)` : ""}`);
  } else {
    lines.push("\nDSA / Live Coding: not yet attempted");
  }

  // AI Skills
  if (aiSkillsScore != null && modules.ai_skills) {
    const ai = modules.ai_skills;
    lines.push(`\nAI Skills Interview: ${aiSkillsScore}/100 — ${byComp["AI_SKILLS"]?.pass ? "PASSED" : "DID NOT PASS"}`);
    if (ai.verifiedSkills.length) {
      lines.push(`  Verified: ${ai.verifiedSkills.map((s) => `${s.skill} (${s.confidence}%)`).join(", ")}`);
    }
    if (ai.belowThresholdSkills.length) {
      lines.push(`  Below threshold: ${ai.belowThresholdSkills.map((s) => `${s.skill} (${s.confidence}%)`).join(", ")}`);
    }
    if (ai.claimedNotVerified.length) {
      lines.push(`  Claimed on resume but NOT verified: ${ai.claimedNotVerified.join(", ")}`);
    }
    if (ai.dsaWalkthroughScores.length) {
      const avg = Math.round(ai.dsaWalkthroughScores.reduce((a, b) => a + b, 0) / ai.dsaWalkthroughScores.length);
      lines.push(`  DSA walkthrough avg: ${avg}% (scores: ${ai.dsaWalkthroughScores.join(", ")})`);
    }
  } else {
    lines.push("\nAI Skills Interview: not yet attempted");
  }

  // System Design
  if (systemDesignScore != null && modules.system_design) {
    const sd = modules.system_design;
    lines.push(`\nSystem Design: ${systemDesignScore}/100 — ${byComp["SYSTEM_DESIGN_HLD"]?.pass || byComp["SYSTEM_DESIGN_LLD"]?.pass ? "PASSED" : "DID NOT PASS"}`);
    lines.push(`  LLD: ${sd.lldScore}/100 | HLD: ${sd.hldScore}/100 — weak dimension: ${sd.weakDimension}`);
    if (sd.summary) lines.push(`  Evaluator note: "${sd.summary.slice(0, 120)}"`);
  } else {
    lines.push("\nSystem Design: not yet attempted");
  }

  // Antigravity
  if (antigravityScore != null && modules.antigravity) {
    const ag = modules.antigravity;
    lines.push(`\nExpert AI Interview: ${antigravityScore}/100 — ${byComp["EXPERT_INTERVIEW"]?.pass ? "PASSED" : "DID NOT PASS"}`);
    lines.push(`  Hire recommendation: ${ag.hireRecommendation ?? "N/A"}`);
    const bdParts = Object.entries(ag.breakdown)
      .filter(([, v]) => v !== "inconclusive")
      .map(([k, v]) => `${k.replace("_", " ")} ${v}/10`);
    if (bdParts.length) lines.push(`  Dimension scores: ${bdParts.join(", ")}`);
    const highFailure = Object.entries(ag.failureSurface)
      .filter(([, p]) => p >= 0.5)
      .sort(([, a], [, b]) => b - a)
      .map(([d, p]) => `${d} (${Math.round(p * 100)}%)`);
    if (highFailure.length) lines.push(`  High-failure domains: ${highFailure.join(", ")}`);
    if (ag.strengths.length) lines.push(`  Strengths: ${ag.strengths.slice(0, 3).join("; ")}`);
    if (ag.riskFlags.length) lines.push(`  Risk flags: ${ag.riskFlags.slice(0, 3).join("; ")}`);
    if (ag.claimCredibilityRisk && ag.claimCredibilityRisk.level !== "not_tested") {
      lines.push(`  Credibility risk: ${ag.claimCredibilityRisk.level} — ${ag.claimCredibilityRisk.detail}`);
    }
    if (ag.topWeaknesses.length) {
      lines.push(`  Weakness patterns: ${ag.topWeaknesses.map((w) => `${w.type}×${w.count}`).join(", ")}`);
    }
  } else {
    lines.push("\nExpert AI Interview: not yet attempted");
  }

  // Stress test targets
  if (stressTestTargets.length) {
    lines.push("\n=== Recommended Probe Targets ===");
    for (const t of stressTestTargets.slice(0, 8)) {
      lines.push(`[${t.severity.toUpperCase()}] ${t.area}: ${t.reason}`);
    }
  }

  lines.push("\n=== End of Prior History ===");
  return lines.join("\n");
}

function _emptyContext(): CandidateContext {
  const state: CandidateContextState = {
    version: 2,
    generatedAt: new Date(0).toISOString(),
    candidate: {
      userId: "",
      aggregateScores: {
        dsa: null,
        dataRound: null,
        aiSkills: null,
        systemDesign: null,
        antigravity: null,
      },
      verifiedCompetencies: [],
    },
    modules: {},
    competencies: {},
    probeTargets: [],
    riskSignals: [],
    overview: {
      summary: "No prior assessments.",
      llmContext:
        "=== Candidate Prior Assessment History ===\nNo prior assessment history found.\n=== End of Prior History ===",
    },
  };
  return {
    dsaScore: null,
    aiSkillsScore: null,
    systemDesignScore: null,
    antigravityScore: null,
    verifiedCompetencies: [],
    modules: {},
    stressTestTargets: [],
    contextSummary: "No prior assessments.",
    priorContextForLLM:
      "=== Candidate Prior Assessment History ===\nNo prior assessment history found.\n=== End of Prior History ===",
    state,
  };
}

function _buildCandidateState(
  userId: string,
  modules: SnapshotModules,
  signals: RawSignal[],
  stressTestTargets: StressTestTarget[],
  overview: {
    dsaScore: number | null;
    dataRoundScore: number | null;
    aiSkillsScore: number | null;
    systemDesignScore: number | null;
    antigravityScore: number | null;
    summary: string;
    priorContextForLLM: string;
  }
): CandidateContextState {
  const competencies = Object.fromEntries(
    signals.map((signal) => [
      signal.competency,
      {
        score: signal.score,
        pass: signal.pass,
        source: signal.source,
        capturedAt: signal.capturedAt.toISOString(),
      },
    ])
  );

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    candidate: {
      userId,
      aggregateScores: {
        dsa: overview.dsaScore,
        dataRound: overview.dataRoundScore,
        aiSkills: overview.aiSkillsScore,
        systemDesign: overview.systemDesignScore,
        antigravity: overview.antigravityScore,
      },
      verifiedCompetencies: Object.entries(competencies)
        .filter(([, value]) => value.pass)
        .map(([competency, value]) => ({ competency, score: value.score, pass: value.pass })),
    },
    modules: {
      dsa: modules.dsa,
      dataRound: modules.data_round,
      aiSkills: modules.ai_skills,
      systemDesign: modules.system_design,
      antigravity: modules.antigravity,
    },
    competencies,
    probeTargets: stressTestTargets,
    riskSignals: _deriveRiskSignals(modules, stressTestTargets),
    overview: {
      summary: overview.summary,
      llmContext: overview.priorContextForLLM,
    },
  };
}

function _hydrateStateFromSnapshot(
  userId: string,
  snapshot: {
    dsaScore: number | null;
    aiSkillsScore: number | null;
    systemDesignScore: number | null;
    antigravityScore: number | null;
    verifiedCompetencies: unknown;
  },
  modules: SnapshotModules,
  stressTestTargets: StressTestTarget[],
  summary: string,
  priorContextForLLM: string,
  rawState: unknown
): CandidateContextState {
  if (rawState && typeof rawState === "object") {
    return rawState as CandidateContextState;
  }

  const verifiedCompetencies =
    (snapshot.verifiedCompetencies as Array<{ competency: string; score: number; pass: boolean }>) ?? [];

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    candidate: {
      userId,
      aggregateScores: {
        dsa: snapshot.dsaScore,
        dataRound: modules.data_round?.score ?? null,
        aiSkills: snapshot.aiSkillsScore,
        systemDesign: snapshot.systemDesignScore,
        antigravity: snapshot.antigravityScore,
      },
      verifiedCompetencies,
    },
    modules: {
      dsa: modules.dsa,
      dataRound: modules.data_round,
      aiSkills: modules.ai_skills,
      systemDesign: modules.system_design,
      antigravity: modules.antigravity,
    },
    competencies: {},
    probeTargets: stressTestTargets,
    riskSignals: _deriveRiskSignals(modules, stressTestTargets),
    overview: {
      summary,
      llmContext: priorContextForLLM,
    },
  };
}

function _deriveRiskSignals(
  modules: SnapshotModules,
  stressTestTargets: StressTestTarget[]
): CandidateContextRiskSignal[] {
  const signals: CandidateContextRiskSignal[] = [];
  const antigravity = modules.antigravity;
  if (antigravity) {
    for (const flag of antigravity.riskFlags.slice(0, 4)) {
      signals.push({
        category: "antigravity_risk_flag",
        detail: flag,
        severity: "medium",
        source: "antigravity",
      });
    }
    if (antigravity.claimCredibilityRisk && antigravity.claimCredibilityRisk.level !== "not_tested") {
      signals.push({
        category: "claim_credibility",
        detail: antigravity.claimCredibilityRisk.detail,
        severity: antigravity.claimCredibilityRisk.level === "high" ? "high" : "medium",
        source: "antigravity",
      });
    }
  }

  for (const target of stressTestTargets.slice(0, 6)) {
    signals.push({
      category: "probe_target",
      detail: `${target.area}: ${target.reason}`,
      severity: target.severity,
      source: target.source,
    });
  }

  return signals;
}

function _buildAntigravityContext(state: CandidateContextState): ModuleContextBundle {
  const codingRound = state.modules.dataRound ?? state.modules.dsa ?? null;
  const relevantState = {
    aggregateScores: state.candidate.aggregateScores,
    codingRound,
    aiSkills: state.modules.aiSkills
      ? {
          verifiedSkills: state.modules.aiSkills.verifiedSkills,
          belowThresholdSkills: state.modules.aiSkills.belowThresholdSkills,
          claimedNotVerified: state.modules.aiSkills.claimedNotVerified,
          dsaAvg: state.modules.aiSkills.dsaAvg,
          skillAvg: state.modules.aiSkills.skillAvg,
        }
      : null,
    systemDesign: state.modules.systemDesign
      ? {
          track: state.modules.systemDesign.track,
          lldScore: state.modules.systemDesign.lldScore,
          hldScore: state.modules.systemDesign.hldScore,
          weakDimension: state.modules.systemDesign.weakDimension,
          summary: state.modules.systemDesign.summary ?? null,
        }
      : null,
    priorExpertInterview: state.modules.antigravity ?? null,
    probeTargets: state.probeTargets.slice(0, 8),
    riskSignals: state.riskSignals.slice(0, 8),
  };

  const lines = [
    "=== Prior Candidate Assessment Context ===",
    state.overview.summary || "No prior assessment summary available.",
  ];

  if (codingRound) {
    lines.push(
      `Coding round: ${codingRound.score ?? "N/A"}/100 — ${codingRound.pass ? "passed" : "did not pass"}`
    );
  }
  if (state.modules.aiSkills) {
    const ai = state.modules.aiSkills;
    if (ai.verifiedSkills.length) {
      lines.push(`Previously verified skills: ${ai.verifiedSkills.map((skill) => `${skill.skill} (${skill.confidence}%)`).join(", ")}`);
    }
    if (ai.claimedNotVerified.length) {
      lines.push(`Claimed but not yet verified: ${ai.claimedNotVerified.join(", ")}`);
    }
  }
  if (state.modules.systemDesign) {
    const sd = state.modules.systemDesign;
    lines.push(
      `System design (${sd.track}): LLD ${sd.lldScore}/100, HLD ${sd.hldScore}/100, weak area ${sd.weakDimension}`
    );
  }
  if (state.probeTargets.length) {
    lines.push("Recommended probe targets:");
    for (const target of state.probeTargets.slice(0, 6)) {
      lines.push(`- [${target.severity}] ${target.area}: ${target.reason}`);
    }
  }
  if (state.riskSignals.length) {
    lines.push("Risk signals:");
    for (const signal of state.riskSignals.slice(0, 4)) {
      lines.push(`- [${signal.severity}] ${signal.detail}`);
    }
  }
  lines.push("=== End Prior Context ===");

  return {
    targetModule: "antigravity",
    summary:
      state.probeTargets[0]?.reason ??
      state.overview.summary ??
      "No prior assessment context available.",
    promptContext: lines.join("\n"),
    relevantState,
  };
}

function _buildAiSkillsContext(state: CandidateContextState): ModuleContextBundle {
  const relevantState = {
    codingRound: state.modules.dataRound ?? state.modules.dsa ?? null,
    verifiedCompetencies: state.candidate.verifiedCompetencies,
    priorExpertInterview: state.modules.antigravity ?? null,
    probeTargets: state.probeTargets.filter((target) => target.source !== "antigravity").slice(0, 6),
  };
  const lines = [
    "=== Prior Context For AI Skills ===",
    state.modules.dataRound
      ? `Data round score: ${state.modules.dataRound.score ?? "N/A"}/100`
      : state.modules.dsa
        ? `DSA score: ${state.modules.dsa.score ?? "N/A"}/100`
        : "No prior coding round.",
  ];
  if (state.modules.antigravity?.topWeaknesses.length) {
    lines.push(
      `Expert interview weakness patterns: ${state.modules.antigravity.topWeaknesses
        .map((weakness) => `${weakness.type}×${weakness.count}`)
        .join(", ")}`
    );
  }
  lines.push("=== End Prior Context ===");

  return {
    targetModule: "ai_skills",
    summary: state.overview.summary,
    promptContext: lines.join("\n"),
    relevantState,
  };
}

function _buildSystemDesignContext(state: CandidateContextState): ModuleContextBundle {
  const relevantState = {
    codingRound: state.modules.dataRound ?? state.modules.dsa ?? null,
    aiSkills: state.modules.aiSkills
      ? {
          verifiedSkills: state.modules.aiSkills.verifiedSkills,
          belowThresholdSkills: state.modules.aiSkills.belowThresholdSkills,
        }
      : null,
    priorExpertInterview: state.modules.antigravity
      ? {
          failureSurface: state.modules.antigravity.failureSurface,
          topWeaknesses: state.modules.antigravity.topWeaknesses,
        }
      : null,
    riskSignals: state.riskSignals.slice(0, 6),
  };

  const lines = [
    "=== Prior Context For System Design ===",
    state.modules.aiSkills?.verifiedSkills.length
      ? `Verified implementation areas: ${state.modules.aiSkills.verifiedSkills.map((skill) => skill.skill).join(", ")}`
      : "No verified AI skills yet.",
  ];
  if (state.modules.antigravity) {
    const highFailure = Object.entries(state.modules.antigravity.failureSurface)
      .filter(([, failureProb]) => failureProb >= 0.5)
      .map(([domain, failureProb]) => `${domain} (${Math.round(failureProb * 100)}%)`);
    if (highFailure.length) {
      lines.push(`Prior failure-surface domains: ${highFailure.join(", ")}`);
    }
  }
  lines.push("=== End Prior Context ===");

  return {
    targetModule: "system_design",
    summary: state.overview.summary,
    promptContext: lines.join("\n"),
    relevantState,
  };
}
