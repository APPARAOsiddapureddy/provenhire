/**
 * Adversarial AI interview agents — Gemini-backed (same stack as ai.service).
 * JSON agents parse structured output; follow-up phrasing uses plain text generation.
 */
import type { DataSubtrack, NonTechSubtrack } from "../../constants/verificationPipeline.js";
import { GoogleGenAI } from "@google/genai";

// ── PARSED RESUME TYPE ─────────────────────────────────────────────────────────
export interface ParsedResume {
  skills: string[];
  tools: string[];
  projects: Array<{
    name: string;
    description: string;
    technologies: string[];
    ownership_level: "primary" | "shared" | "supporting";
    contribution_type: "led" | "built" | "contributed" | "assisted";
  }>;
  claims: Array<{
    text: string;
    project: string;
    strength: "modest" | "strong" | "flagship";
    contribution_type: "led" | "built" | "contributed" | "assisted";
  }>;
  experiences: Array<{
    title: string;
    company: string;
    duration: string;
    contribution_type: "led" | "built" | "contributed" | "assisted";
  }>;
  experience: { ml: number; swe: number; data_eng: number };
  experience_tier: "junior" | "mid" | "senior";
}

const geminiApiKey = process.env.GEMINI_API_KEY;
const gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

function responseText(response: unknown): string {
  return String((response as { text?: string })?.text ?? "").trim();
}

export async function callGeminiJson(system: string, user: string, tier: "fast" | "balanced" | "deep"): Promise<unknown> {
  if (!gemini) return null;
  const model =
    tier === "fast" ? "gemini-2.0-flash" : tier === "deep" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  try {
    const response = await gemini.models.generateContent({
      model,
      contents: `${system}\n\n${user}`,
      config: { temperature: 0.2, responseMimeType: "application/json" },
    });
    const text = responseText(response);
    try {
      return JSON.parse(text.replace(/^```json\n?|```$/g, "").trim());
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  } catch (e) {
    console.error("[interview/gemini] JSON generation failed:", e);
    return null;
  }
}

export async function callGeminiText(
  system: string,
  user: string,
  tier: "fast" | "balanced" | "deep",
  opts?: { maxOutputTokens?: number }
): Promise<string> {
  if (!gemini) return "";
  const model =
    tier === "fast" ? "gemini-2.0-flash" : tier === "deep" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  try {
    const response = await gemini.models.generateContent({
      model,
      contents: `${system}\n\n${user}`,
      config: {
        temperature: 0.35,
        ...(opts?.maxOutputTokens != null ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      },
    });
    return responseText(response);
  } catch (e) {
    console.error("[interview/gemini] text generation failed:", e);
    return "";
  }
}

// ── CONCEPT AGENT ─────────────────────────────────────────────────────────────
export async function extractConcepts(answer: string): Promise<string[]> {
  const result = (await callGeminiJson(
    `You are a concept extraction engine. Extract key technical concepts from the candidate's answer. Ignore filler words. Return JSON: {"concepts": [...]}`,
    `Candidate answer: ${answer}`,
    "fast"
  )) as { concepts?: string[] } | null;
  return Array.isArray(result?.concepts) ? result.concepts.map(String) : [];
}

// ── WEAKNESS AGENT ────────────────────────────────────────────────────────────
export async function detectWeakness(
  question: string,
  answer: string,
  sprint: number,
  priorWeaknesses: { type?: string }[],
  opts?: { tier?: "fast" | "balanced" }
): Promise<{
  weakness: string;
  type: string;
  severity: "low" | "medium" | "high";
  attackStrategy: string;
  suggestedFollowup?: string;
}> {
  const sprintFocus: Record<number, string> = {
    1: "Focus on: did they actually build this? Are they vague about their own contribution?",
    2: "Focus on: are they hand-waving fundamentals? Is reasoning mechanically correct?",
    3: "Focus on: are they ignoring trade-offs, failure modes, or scale implications?",
  };
  const focus = sprintFocus[sprint] ?? "";
  const priorContext =
    priorWeaknesses.length > 0
      ? `Already probed: ${priorWeaknesses
          .slice(-3)
          .map((w) => w.type)
          .join(", ")}. Avoid redundant detection.`
      : "";

  const result = (await callGeminiJson(
    `You are a technical interviewer analyzing a candidate's answer for reasoning gaps.
Do NOT validate or praise. Find the most significant weakness.

Weakness types: missing_step | vague | incorrect | shallow | overconfidence | calibration_success
Attack strategies: implementation_probe | edge_case | scaling | contradiction | step_by_step | explore_depth
Severity: high (must probe) | medium (worth following up) | low (minor)
If the candidate explicitly admits uncertainty, corrects themselves, or shows honest calibration, use type **calibration_success**, severity at most **medium**, attackStrategy **explore_depth**.
Use **high** only for a clear substantive gap. Routine brevity, oral fillers, or minor vagueness → **medium** or **low** so the interview does not over-probe.

Return JSON only:
{
  "weakness": "<one sentence describing the specific gap>",
  "type": "missing_step | vague | incorrect | shallow | overconfidence | calibration_success",
  "severity": "low | medium | high",
  "attackStrategy": "implementation_probe | edge_case | scaling | contradiction | step_by_step | explore_depth",
  "suggestedFollowup": "<short probe idea, optional>"
}`,
    `Sprint ${sprint} — ${focus}\n${priorContext}\n\nQuestion: ${question}\n\nCandidate Answer: ${answer}`,
    opts?.tier ?? "balanced"
  )) as {
    weakness?: string;
    type?: string;
    severity?: string;
    attackStrategy?: string;
  } | null;

  if (!result?.weakness) {
    return {
      weakness: "Vague answer",
      type: "vague",
      severity: "low",
      attackStrategy: "step_by_step",
    };
  }
  let sev: "low" | "medium" | "high" =
    result.severity === "high" || result.severity === "medium" ? result.severity : "low";
  let wType = String(result.type ?? "vague");
  let atk = String(result.attackStrategy ?? "step_by_step");
  if (HONEST_ADMISSION_RE.test(answer)) {
    if (sev === "high") sev = "medium";
    wType = "calibration_success";
    if (!atk.includes("explore")) atk = "explore_depth";
  }
  return {
    weakness: String(result.weakness),
    type: wType,
    severity: sev,
    attackStrategy: atk,
    suggestedFollowup:
      typeof (result as { suggestedFollowup?: unknown }).suggestedFollowup === "string"
        ? String((result as { suggestedFollowup?: string }).suggestedFollowup)
        : undefined,
  };
}

// ── DISCREPANCY AGENT ─────────────────────────────────────────────────────────
export async function checkDiscrepancy(
  resume: string,
  answer: string,
  opts?: { tier?: "fast" | "balanced" }
): Promise<{
  conflict: boolean;
  description: string;
  severity: "low" | "high";
  resumeClaim: string;
  actualStatement: string;
}> {
  const result = (await callGeminiJson(
    `Compare resume claims vs candidate explanation. Detect inconsistencies between what they claim to have built/know and what they demonstrate.
Return JSON: {"conflict": true/false, "description": "...", "severity": "low | high", "resumeClaim": "short quote or paraphrase of resume claim being tested", "actualStatement": "what they said in this answer that conflicts"}`,
    `Resume:\n${resume.slice(0, 2000)}\n\nCandidate Explanation:\n${answer}`,
    opts?.tier ?? "balanced"
  )) as {
    conflict?: boolean;
    description?: string;
    severity?: string;
    resumeClaim?: string;
    actualStatement?: string;
  } | null;
  if (!result) return { conflict: false, description: "", severity: "low", resumeClaim: "", actualStatement: "" };
  return {
    conflict: Boolean(result.conflict),
    description: String(result.description ?? ""),
    severity: result.severity === "high" ? "high" : "low",
    resumeClaim: String(result.resumeClaim ?? "").trim(),
    actualStatement: String(result.actualStatement ?? "").trim(),
  };
}

/** Markers suggesting intellectual honesty — do not treat as evasion. */
const HONEST_ADMISSION_RE =
  /to be honest|i don't know|i do not know|i should be clear|it's basically just|it is basically just|actually it's more like|actually it is more like|i should be precise|i am not sure|i'm not sure|i was wrong|i made a mistake/i;

// ── REASONING BEHAVIOR AGENT ──────────────────────────────────────────────────
export type ReasoningBehaviorMarker =
  | "admitted_gap"
  | "pivoted_elegantly"
  | "confident"
  | "distressed"
  | "overconfident"
  | "deflecting";

export type ReasoningBehaviorOutput = {
  structureScore: number;
  clarificationBehavior: string;
  adaptability: "flexible" | "rigid" | "defensive";
  confidenceCalibration: "calibrated" | "overconfident" | "underconfident";
  /** Full behavioral classification (Gemini + defaults). */
  behavior_marker: ReasoningBehaviorMarker;
  /** True when the candidate showed explicit intellectual honesty (subset of markers). */
  honesty_signal: boolean;
  tone: "composed" | "uncertain" | "defensive" | "engaged";
  escalation_recommendation: "de-escalate" | "maintain" | "probe_deeper";
  /** Optional flags used by orchestrator / eval (keep for backward compat). */
  calibration_success?: boolean;
  explore_depth?: boolean;
};

function normalizeReasoningBehavior(raw: Record<string, unknown>, answer: string): ReasoningBehaviorOutput {
  const adapt = String(raw.adaptability ?? "rigid");
  const conf = String(raw.confidenceCalibration ?? "calibrated");
  const markerRaw = String(raw.behavior_marker ?? "").toLowerCase();
  const allowed: ReasoningBehaviorMarker[] = [
    "admitted_gap",
    "pivoted_elegantly",
    "confident",
    "distressed",
    "overconfident",
    "deflecting",
  ];
  let behavior_marker: ReasoningBehaviorMarker = allowed.includes(markerRaw as ReasoningBehaviorMarker)
    ? (markerRaw as ReasoningBehaviorMarker)
    : "confident";
  if (HONEST_ADMISSION_RE.test(answer)) {
    behavior_marker = "admitted_gap";
  }
  const honesty_signal = Boolean(raw.honesty_signal) || behavior_marker === "admitted_gap" || behavior_marker === "pivoted_elegantly";
  const toneRaw = String(raw.tone ?? "composed").toLowerCase();
  const tone: ReasoningBehaviorOutput["tone"] =
    toneRaw === "uncertain" || toneRaw === "defensive" || toneRaw === "engaged" ? toneRaw : "composed";
  const escRaw = String(raw.escalation_recommendation ?? "maintain").toLowerCase();
  const escalation_recommendation: ReasoningBehaviorOutput["escalation_recommendation"] =
    escRaw === "de-escalate" || escRaw === "probe_deeper" ? escRaw : "maintain";

  return {
    structureScore: Math.min(3, Math.max(0, Number(raw.structureScore) || 0)),
    clarificationBehavior: String(raw.clarificationBehavior ?? "answers_directly"),
    adaptability: adapt === "flexible" || adapt === "defensive" ? adapt : "rigid",
    confidenceCalibration: conf === "overconfident" || conf === "underconfident" ? conf : "calibrated",
    behavior_marker,
    honesty_signal,
    tone,
    escalation_recommendation,
    calibration_success: Boolean(raw.calibration_success),
    explore_depth: Boolean(raw.explore_depth),
  };
}

export async function evaluateReasoning(answer: string, wasChallenged: boolean): Promise<ReasoningBehaviorOutput> {
  const result = (await callGeminiJson(
    `Evaluate HOW the candidate thinks and communicates. Do NOT score technical correctness.
Return JSON only with this shape:
{
  "structureScore": 0-3,
  "clarificationBehavior": "asks_clarification|answers_directly|avoids|mixed",
  "adaptability": "flexible|rigid|defensive",
  "confidenceCalibration": "calibrated|overconfident|underconfident",
  "behavior_marker": "admitted_gap|pivoted_elegantly|confident|distressed|overconfident|deflecting",
  "honesty_signal": true/false,
  "tone": "composed|uncertain|defensive|engaged",
  "escalation_recommendation": "de-escalate|maintain|probe_deeper",
  "calibration_success": true/false,
  "explore_depth": true/false
}
Definitions:
- admitted_gap: explicitly says they don't know or are unsure of a key part.
- pivoted_elegantly: redirects to an adjacent strength credibly without evading.
- deflecting: answers a different question than asked or refuses the frame without negotiating.
- distressed: fragmented, heavy hedging, or self-contradictory under pressure.
- escalation_recommendation: de-escalate if they are honest or overwhelmed; probe_deeper if they are hand-waving with false confidence; maintain otherwise.`,
    `Candidate was challenged: ${wasChallenged}\n\nAnswer:\n${answer}`,
    "balanced"
  )) as Record<string, unknown> | null;
  const r = result && typeof result === "object" ? result : {};
  return normalizeReasoningBehavior(r, answer);
}

/** Soften or sharpen weakness severity using reasoning behavior (honesty loop + escalation policy). */
export function applyReasoningHonestyCap(
  weakness: { type?: string; severity?: string; attackStrategy?: string },
  reasoning: ReasoningBehaviorOutput
): void {
  if (reasoning.escalation_recommendation === "de-escalate") {
    if (weakness.severity === "high") weakness.severity = "medium";
  } else if (reasoning.escalation_recommendation === "probe_deeper") {
    if (weakness.severity === "medium") weakness.severity = "high";
  }
  if (reasoning.adaptability === "flexible" && reasoning.confidenceCalibration === "calibrated") {
    if (weakness.severity === "high") weakness.severity = "medium";
    weakness.type = "calibration_success";
    weakness.attackStrategy = "explore_depth";
  }
}

// ── FOLLOWUP AGENT ────────────────────────────────────────────────────────────

/** Shared rubric: medium conversational questions (voice interview) — India-first clarity: not tiny, not a lecture. */
const MEDIUM_QUESTION_RUBRIC = `Ask ONE medium-length spoken question: **2 or 3 sentences total** (aim for roughly 45–95 words).
First sentence: brief setup or anchor to their answer or background. Second (and optional third): one clear ask.
Exactly **one** main question mark for what they must answer. No bullet lists, no multiple unrelated asks.
Sound natural — clear Indian / international English (plain words, avoid idioms that confuse non-native listeners).
Never start with thanks, thank you, praise, or hollow enthusiasm — jump straight to the substance.

GOOD (medium, scannable when heard aloud):
"You mentioned using Redis for caching in your project. Walk me through how you chose what to cache and how you would invalidate it when upstream data changes — what was your main risk?"

BAD (too short — do not generate):
"Why Redis?"
"What are the trade-offs?"

BAD (too long — do not generate):
Four or more sentences, more than ~110 words, or a long preamble before the question.

Output only the question text — no meta like "Here is my question:".`;

const PERSONA_PROMPTS: Record<string, string> = {
  curious_lead: `You are a Curious Lead interviewer.
Conversational, specific, curious. Reference something concrete from their background or last answer. No yes/no questions.
${MEDIUM_QUESTION_RUBRIC}`,

  socratic_mentor: `You are a Socratic Mentor interviewer.
Clear, focused on reasoning — understanding, not trivia. Make them think out loud.
${MEDIUM_QUESTION_RUBRIC}`,

  senior_peer: `You are a Senior Peer interviewer.
Real engineering trade-offs and constraints. Treat them as a peer. Ground it in realistic scenarios.
${MEDIUM_QUESTION_RUBRIC}`,
};

const ATTACK_INSTRUCTIONS: Record<string, string> = {
  implementation_probe:
    "In 2–3 sentences only, ask them to walk through the exact mechanism or data path with concrete details.",
  step_by_step:
    "In 2–3 sentences only, ask them to reason through the steps in order and where each could fail.",
  contradiction:
    "In 2–3 sentences only, surface the inconsistency directly but calmly, and give them room to clarify.",
  edge_case: "In 2–3 sentences only, introduce a specific breaking scenario and ask how their design behaves.",
  scaling: "In 2–3 sentences only, push scale (e.g. 10x traffic or data) and ask what breaks first and why.",
  explore_depth:
    "In 2–3 sentences only, ask one precise follow-up that deepens understanding without repeating prior questions.",
};

const SPRINT_GOALS: Record<number, string> = {
  1: "Build a clear picture of the candidate's most significant project — the problem it solved, why they built it this way, what they personally contributed, and what challenges they faced.",
  2: "Explore the candidate's conceptual understanding of the technical ideas underlying their work — not trivia, but genuine reasoning about how things work and why.",
  3: "Think through real engineering trade-offs together — scaling decisions, failure modes, design alternatives. Treat it as a collaborative discussion.",
};

/** Non-technical adversarial v2 — PRD §7 (April 2026). */
const NON_TECH_SPRINT_GOALS: Record<number, string> = {
  1: "Experience defense: relevant work, projects, or initiatives — their role, impact, trade-offs, and what they learned. Probe for specifics vs vague contributions.",
  2: "Domain foundations: subtrack-appropriate frameworks, metrics, and concepts — depth matched to their level, not trivia.",
  3: "Scenario: realistic on-the-job situations — deadlines, stakeholders, prioritization, conflict, and communication. Assess structured thinking and judgment.",
};

const NON_TECH_SUBTRACK_CAL: Record<NonTechSubtrack, string> = {
  product:
    "Product context: discovery, prioritization (e.g. RICE, MoSCoW), metrics, roadmap trade-offs, stakeholder alignment.",
  design:
    "Design context: research, IA, accessibility, design process, critique, collaboration with engineering; portfolio-level narratives if mentioned.",
  business:
    "Business / analytics / commercial context: problem framing, data interpretation, KPIs, structured recommendations, financial literacy.",
  operations:
    "Operations / delivery context: planning, risk, execution, process improvement, governance, stakeholder cadence.",
  marketing:
    "Marketing / growth context: channels, funnels, experiments, messaging, launch metrics, budget trade-offs.",
  people:
    "People / HR / customer-success context: structured assessment, fairness, engagement, difficult people situations, service recovery.",
};

/** Data-track AI Expert — pipelines, modeling, and analytics depth (not generic backend API design). */
const DATA_SPRINT_GOALS: Record<number, string> = {
  1:
    "Understand a significant data project they owned: problem, data sources, transformations, models or metrics they delivered, and what was hard.",
  2:
    "Probe conceptual depth on data fundamentals for their level — SQL/analytics logic, stats/ML intuition, data quality, or evaluation — grounded in their experience.",
  3:
    "Stress-test data architecture thinking: scale, reliability, cost, lineage, monitoring, failure modes, and sensible trade-offs for pipelines or ML systems.",
};

const DATA_SUBTRACK_CAL: Record<DataSubtrack, string> = {
  engineering:
    "Data engineering bias: ingestion, orchestration, warehousing, incremental loads, partitioning, Spark/batch/streaming trade-offs, observability.",
  science:
    "Data science / ML bias: modeling choices, offline vs online metrics, training/serving skew, experimentation, drift, responsible use of data.",
  analysis:
    "Analytics bias: metric definitions, SQL complexity, dashboard trustworthiness, causal caution, stakeholder-ready insights.",
};

/** Lines to append to prompts so the model avoids repeating the same short question many turns in a row. */
export function formatAskedQuestionsBlock(questions: string[], maxLines = 16): string {
  const u = [...new Set(questions.map((q) => q.trim()).filter(Boolean))].slice(-maxLines);
  if (!u.length) return "";
  return `\nAlready asked in this session (must not repeat or near-duplicate):\n${u.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`;
}

export async function generateWeaknessFollowup(
  question: string,
  answer: string,
  weakness: { weakness?: string; attackStrategy?: string },
  persona: string,
  resumeContext: string,
  recentAsked: string[] = []
): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;
  const attackInstruction =
    ATTACK_INSTRUCTIONS[weakness.attackStrategy ?? ""] ?? ATTACK_INSTRUCTIONS.step_by_step;

  const text = await callGeminiText(
    system,
    `Candidate background: ${resumeContext.slice(0, 800)}
Previous question: ${question}
Candidate's answer: ${answer}
Weakness detected: ${weakness.weakness ?? ""}
Attack strategy: ${attackInstruction}
Generate ONE follow-up executing this strategy; ground it in something specific from their answer.
${formatAskedQuestionsBlock(recentAsked)}
Follow the medium-length rubric in your system instructions.`,
    "balanced",
    { maxOutputTokens: 320 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || "Can you walk me through that in more detail?";
}

export async function generateDiscrepancyFollowup(
  question: string,
  answer: string,
  discrepancy: { description?: string },
  persona: string,
  resumeContext: string,
  recentAsked: string[] = []
): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;

  const text = await callGeminiText(
    system,
    `Candidate background: ${resumeContext.slice(0, 800)}
Previous question: ${question}
Candidate's answer: ${answer}
Discrepancy: ${discrepancy.description ?? ""}
Generate ONE question that surfaces this inconsistency — curious and direct, not accusatory. Give them a chance to explain.
${formatAskedQuestionsBlock(recentAsked)}
Generate ONE question. Curious not accusatory. Follow the medium-length rubric in your system instructions.`,
    "balanced",
    { maxOutputTokens: 320 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || "Can you tell me more about your specific role in that?";
}

export async function adaptFollowup(template: string, answer: string, persona: string): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;
  const text = await callGeminiText(
    system,
    `Bank follow-up template: ${template}
Candidate just said: ${answer.slice(0, 1200)}
Rewrite into ONE medium-length spoken question (2–3 sentences, ~45–95 words). Same intent as the template. No thanks or filler — output only the question.`,
    "balanced",
    { maxOutputTokens: 320 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || template;
}

/** Fast inline bank follow-up hydration (Gemini Flash, short output) for fast-track fallback. */
export async function adaptFollowupFast(template: string, answer: string, persona: string): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;
  const text = await callGeminiText(
    system,
    `Bank follow-up template: ${template}
Candidate just said: ${answer.slice(0, 1200)}
Rewrite into ONE medium-length spoken question (2–3 sentences, ~45–95 words). Same intent as the template. No thanks or filler — output only the question.`,
    "fast",
    { maxOutputTokens: 256 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || template;
}

export async function generateSprintQuestion(
  sprint: number,
  persona: string,
  resumeContext: string,
  history: { question?: string }[],
  recentAsked?: string[],
  opts?: {
    nonTechnical?: boolean;
    subtrack?: NonTechSubtrack;
    dataTrack?: boolean;
    dataSubtrack?: DataSubtrack;
  }
): Promise<string> {
  const fromHist = history
    .map((h) => h.question)
    .filter(Boolean)
    .map(String) as string[];
  const merged = [...new Set([...(recentAsked ?? []), ...fromHist].filter(Boolean))].slice(-18);
  const covered = merged.length ? merged.join("\n- ") : "(none yet)";
  let system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;
  if (opts?.nonTechnical) {
    system = `${system}

You are interviewing for a non-technical professional role. Do not ask for code, algorithms, or software system architecture unless the candidate is clearly from a technical background. Emphasize communication, stakeholder dynamics, and domain judgment.${
      persona === "senior_peer"
        ? " Use organizational and scenario challenges, not low-level engineering design."
        : ""
    }`;
  } else if (opts?.dataTrack) {
    system = `${system}

You are interviewing a DATA TRACK candidate (analytics, data engineering, data science, or MLOps). Prioritize data pipelines, storage, SQL/analytical reasoning, statistics/ML, and measurable outcomes — not generic CRUD API or front-end system design unless their background is clearly full-stack data apps. Keep questions spoken-interview friendly (no coding on a whiteboard).`;
  }

  const sprintGoal = opts?.nonTechnical
    ? NON_TECH_SPRINT_GOALS[sprint] ?? ""
    : opts?.dataTrack
      ? DATA_SPRINT_GOALS[sprint] ?? ""
      : SPRINT_GOALS[sprint] ?? "";
  const subAngle = opts?.nonTechnical
    ? opts.subtrack
      ? NON_TECH_SUBTRACK_CAL[opts.subtrack] ?? ""
      : ""
    : opts?.dataTrack && opts.dataSubtrack
      ? DATA_SUBTRACK_CAL[opts.dataSubtrack] ?? ""
      : "";

  const text = await callGeminiText(
    system,
    `Sprint goal: ${sprintGoal}
${subAngle ? `Calibration: ${subAngle}\n` : ""}Candidate background: ${resumeContext.slice(0, 800)}
Questions already asked — do NOT repeat or ask the same angle again:
- ${covered}
Your next question must open a meaningfully different line of inquiry (new sub-topic, trade-off, or concrete detail), not a minor rewording of any line above.

Generate ONE question that opens a meaningfully new line of inquiry. Follow the medium-length rubric in your system instructions.`,
    "balanced",
    { maxOutputTokens: 340 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || (opts?.nonTechnical ? "Walk me through a situation where you had to align stakeholders under ambiguity — what did you do first?" : "Tell me about a technical challenge you faced recently.");
}

export async function prefetchFollowups(
  concepts: string[],
  resumeContext: string,
  sprint: number,
  persona: string
): Promise<string[]> {
  if (!concepts.length) return [];
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;

  const result = (await callGeminiJson(
    system,
    `Sprint ${sprint} — ${SPRINT_GOALS[sprint] ?? ""}
Candidate background: ${resumeContext.slice(0, 600)}
The candidate is currently talking about: ${concepts.slice(0, 3).join(", ")}.
Generate 2 distinct follow-up questions (different angles; not paraphrases). Each should be **2–3 sentences**, medium-length (~45–95 words each), no "thank you" or praise — questions only.
Return JSON: {"questions": ["...", "..."]}`,
    "fast"
  )) as { questions?: string[] } | null;

  return Array.isArray(result?.questions) ? result.questions.map(String).slice(0, 2) : [];
}

// ── EVALUATION AGENT ──────────────────────────────────────────────────────────
const EXPERIENCE_EVAL_HINT: Record<string, string> = {
  junior:
    "Junior benchmark: score 70+ for correct core concepts even if depth is limited. Do not penalize missing advanced edge cases.",
  mid: "Mid benchmark: score 70+ for solid practical application with reasonable trade-off reasoning.",
  senior:
    "Senior benchmark: score 70+ only with ownership, architectural awareness, and mentoring signal. Penalize surface-level answers.",
};

/**
 * Final interview adjudication from Q/A transcript + aggregated weakness/reasoning signals.
 * Note: per-turn `history` rows may attach weakness/discrepancy/reasoning metadata up to one turn
 * after the answer (strict fast/slow staging); the Q/A text itself is always the canonical pair.
 */
export async function evaluateFullInterview(
  history: {
    sprint?: number;
    persona?: string;
    question?: string;
    answer?: string;
  }[],
  resume: string,
  weaknesses: { type?: string; severity?: string; weakness?: string }[],
  reasoningSignals: { structureScore?: number }[],
  meta?: {
    coverageRatio: number;
    experienceLevel?: string | null;
    jobRole?: string | null;
    /** Non-technical track: calibrate for communication-heavy roles (PM, design, etc.). */
    nonTechnical?: boolean;
    /** Data track: calibrate for data/ML/analytics technical depth. */
    dataTrack?: boolean;
  }
): Promise<Record<string, unknown> | null> {
  const transcript = history
    .map(
      (h) =>
        `[Sprint ${h.sprint ?? "?"} | ${h.persona ?? ""}]\nQ: ${h.question ?? ""}\nA: ${h.answer ?? ""}`
    )
    .join("\n\n");

  const weaknessSummary =
    weaknesses.length > 0
      ? weaknesses.map((w) => `- ${w.type} (${w.severity}): ${w.weakness}`).join("\n")
      : "None detected.";

  const avgStructure =
    reasoningSignals.length > 0
      ? reasoningSignals.reduce((s, r) => s + (Number(r.structureScore) || 0), 0) / reasoningSignals.length
      : 0;

  const coverage = meta?.coverageRatio ?? 0;
  const exp = (meta?.experienceLevel ?? "mid").toLowerCase();
  const expBlock = EXPERIENCE_EVAL_HINT[exp] ?? EXPERIENCE_EVAL_HINT.mid;
  const coverageBlock =
    coverage < 0.3
      ? `Coverage ratio ${coverage.toFixed(2)} is LOW. Lower overall confidence. Mark under-tested dimensions as inconclusive. Prefer "insufficient data on X" over confident negatives on areas not probed. Set confidence_calibrated to false.`
      : `Coverage ratio ${coverage.toFixed(2)}. Set confidence_calibrated to true unless other factors contradict.`;

  const nonTechBlock = meta?.nonTechnical
    ? `
This is a NON-TECHNICAL role interview (product, design, operations, marketing, people, business).
- Calibrate concept_score and reasoning_score for domain/process thinking, not code.
- communication_score should weigh heavily in your holistic judgment (articulation, structure, stakeholder awareness).
- engineering_signal may reflect "professional execution" / structured thinking rather than software engineering.
- Overall rubric alignment: concept 30%, reasoning 25%, communication 30%, confidence 15% when you set dimension scores so they could combine consistently.
`
    : "";

  const dataTrackBlock =
    meta?.dataTrack && !meta?.nonTechnical
      ? `
This is a DATA TRACK technical interview (analytics, data engineering, data science, ML ops).
- Weight concept_score and reasoning_score toward data systems: pipelines, SQL/analytics, stats/ML intuition, reliability, and data quality — not leetcode trivia.
- engineering_signal should reflect ability to design and reason about data-heavy systems (batch/stream, storage, orchestration, modeling lifecycle) at the stated experience level.
`
      : "";

  const roleKind = meta?.nonTechnical ? "professional " : meta?.dataTrack ? "data-technical " : "technical ";
  const signalLabel = meta?.nonTechnical ? "professional" : "technical/data";

  const result = await callGeminiJson(
    `You are evaluating a complete adversarial ${roleKind}interview across 3 sprints.
You must produce TWO SEPARATE assessments:
1) claim_credibility_risk: were specific resume claims substantiated in dialogue? (none | low | medium | high)
2) engineering_signal: overall ${signalLabel} ability independent of claim disputes (strong | moderate | inconclusive | weak)
${nonTechBlock}${dataTrackBlock}

Return JSON:
{
  "overall_score": <0-10>,
  "breakdown": {
    "reasoning": <0-10>,
    "technical_depth": <0-10>,
    "communication": <0-10>,
    "adaptability": <0-10>
  },
  "concept_score": <0-100>,
  "reasoning_score": <0-100>,
  "communication_score": <0-100>,
  "confidence_score": <0-100>,
  "failure_surface": {"<domain>": <0.0-1.0>},
  "hire_recommendation": "HIRE | MAYBE | NO HIRE",
  "confidence_level": "High | Medium | Low",
  "confidence_calibrated": <boolean>,
  "final_verdict": "<2-3 sentences for candidate>",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "authenticity_concern": false,
  "authenticity_reason": "",
  "claim_credibility_risk": "none | low | medium | high",
  "claim_credibility_detail": "<one sentence or empty>",
  "engineering_signal": "strong | moderate | inconclusive | weak",
  "engineering_signal_detail": "<one sentence>",
  "per_question_scores": [
    {
      "question_index": 0,
      "score_conceptual": <0-100>,
      "score_reasoning": <0-100>,
      "score_communication": <0-100>,
      "rationale": "<one line>",
      "key_points_hit": ["..."],
      "key_points_missed": ["..."]
    }
  ]
}

Include one per_question_scores object per Q&A turn in the same order as the interview (indices 0..n-1).

${coverageBlock}
Experience level for this candidate: ${exp}. ${expBlock}
Role context: ${meta?.jobRole ?? "Technical candidate"}`,
    `RESUME:\n${resume.slice(0, 1500)}

INTERVIEW TRANSCRIPT (${history.length} turns):
${transcript}

DETECTED WEAKNESSES:
${weaknessSummary}

REASONING BEHAVIOR:
Average structure score: ${avgStructure.toFixed(1)}/3`,
    "deep"
  );

  return result && typeof result === "object" ? (result as Record<string, unknown>) : null;
}

const DATA_SD_RUBRIC = `Ask one medium-length spoken question (2–3 sentences, ~45–95 words). Plain, clear English for an Indian professional audience. Sound like a senior data architect / staff DS — no "thank you" preambles. Output only the question.`;

export async function generateDataSystemDesignQuestion(
  phase: "lld" | "hld",
  history: { question: string; answer: string }[],
  resumeContext: string,
  dataSubtrack: DataSubtrack,
  experienceLevel: string,
  recentQuestions: string[]
): Promise<string> {
  const phaseGoal =
    phase === "lld"
      ? "Low-level data design: schemas, keys, incremental loading, data contracts, transformation logic, validation, and how correctness is guaranteed."
      : "High-level data platform: orchestration, storage choices, batch vs stream, SLAs, monitoring, cost, failure recovery, security/PII boundaries, and cross-team interfaces.";
  const cal = DATA_SUBTRACK_CAL[dataSubtrack] ?? DATA_SUBTRACK_CAL.engineering;
  const histBlock = history
    .slice(-6)
    .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`)
    .join("\n\n");

  const text = await callGeminiText(
    `You are a technical interviewer for DATA system design. ${DATA_SD_RUBRIC}`,
    `Phase: ${phase.toUpperCase()}
${phaseGoal}
Calibration angle: ${cal}
Candidate experience (engineering scale): ${experienceLevel}
Candidate context: ${resumeContext.slice(0, 900)}

Recent dialogue (ground follow-ups here):
${histBlock || "(first follow-up after phase opener)"}

${formatAskedQuestionsBlock(recentQuestions)}

Generate the NEXT question only. It must advance the design discussion — not repeat prior angles.`,
    "balanced",
    { maxOutputTokens: 340 }
  );
  return text.replace(/^["']|["']$/g, "").trim() || "What is the core entity model you would use, and how would you enforce data quality at ingest?";
}

export async function evaluateDataSystemDesignSession(
  history: { phase: "lld" | "hld"; question: string; answer: string }[],
  resumeContext: string,
  dataSubtrack: DataSubtrack,
  experienceLevel: string
): Promise<{
  lldScore: number;
  hldScore: number;
  totalScore: number;
  pass: boolean;
  summary: string;
} | null> {
  const transcript = history
    .map((h, i) => `[${i + 1} | ${h.phase.toUpperCase()}]\nQ: ${h.question}\nA: ${h.answer}`)
    .join("\n\n");
  const result = (await callGeminiJson(
    `You score a spoken data system design interview in two phases: LLD (first half of transcript) vs HLD (second half).
Subtrack calibration: ${DATA_SUBTRACK_CAL[dataSubtrack]}.
Experience level: ${experienceLevel}.
Return JSON only:
{
  "lld_score": <0-100>,
  "hld_score": <0-100>,
  "total_score": <0-100>,
  "pass": <boolean> (true if total_score >= 55 AND both lld_score and hld_score >= 45 for mid/senior; for fresher path if total_score >= 50),
  "summary": "<2 sentences>"
}`,
    `RESUME/CONTEXT:\n${resumeContext.slice(0, 1200)}\n\nTRANSCRIPT:\n${transcript.slice(0, 12000)}`,
    "balanced"
  )) as {
    lld_score?: number;
    hld_score?: number;
    total_score?: number;
    pass?: boolean;
    summary?: string;
  } | null;

  if (!result) return null;
  const lld = Math.min(100, Math.max(0, Math.round(Number(result.lld_score) || 0)));
  const hld = Math.min(100, Math.max(0, Math.round(Number(result.hld_score) || 0)));
  let total = Math.min(100, Math.max(0, Math.round(Number(result.total_score) || (lld + hld) / 2)));
  const exp = experienceLevel.toLowerCase();
  const passBarrierTotal = exp === "junior" ? 50 : 55;
  const passBarrierDim = exp === "junior" ? 40 : 45;
  const pass =
    typeof result.pass === "boolean"
      ? result.pass
      : total >= passBarrierTotal && lld >= passBarrierDim && hld >= passBarrierDim;
  return {
    lldScore: lld,
    hldScore: hld,
    totalScore: total,
    pass,
    summary: String(result.summary ?? "").trim() || "Evaluation complete.",
  };
}

// ── RESUME AGENT ───────────────────────────────────────────────────────────────

function _heuristicParseResume(resumeText: string, yearsExperience = ""): ParsedResume {
  const lines = resumeText.split("\n").map((l) => l.trim()).filter(Boolean);
  const skills: string[] = [];
  const tools: string[] = [];
  const experiences: ParsedResume["experiences"] = [];
  const projects: ParsedResume["projects"] = [];
  const claims: ParsedResume["claims"] = [];
  let currentProject = "";
  let currentContribution: "led" | "built" | "contributed" | "assisted" = "contributed";

  const splitTokens = (text: string) =>
    text.split(/[,•|/]+/).map((t) => t.trim().replace(/^[-:\s]+|[-:\s]+$/g, "")).filter((t) => t.length > 1);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lower = line.toLowerCase();

    if (lower.includes("top skills:") || lower.startsWith("skills:") || lower.startsWith("technical skills")) {
      const payload = line.includes(":") ? line.split(":").slice(1).join(":") : line;
      for (const t of splitTokens(payload)) if (!skills.includes(t)) skills.push(t);
      continue;
    }
    if (["aws", "docker", "linux", "gcp", "git", "deployment"].some((kw) => lower.includes(kw))) {
      for (const t of splitTokens(line)) if (!tools.includes(t) && t.length > 1) tools.push(t);
    }
    if (!line.startsWith("•") && !line.startsWith("-") && !line.startsWith("*") &&
      (line.includes("@") || lower.includes("intern") || lower.includes("engineer") || lower.includes("research assistant"))) {
      const company = line.includes("@") ? line.split("@")[1]?.split(/\s+\d{4}/)[0]?.trim().replace(/\s+-\s*$/, "") ?? "" : "";
      const title = line.split("@")[0]?.trim().replace(/\s{2,}/g, " ") ?? line;
      const durMatch = /((19|20)\d{2}[^@]*)$/.exec(line);
      const duration = durMatch?.[1]?.trim() ?? "";
      const contrib = lower.includes("assistant") ? "assisted" : lower.includes("engineer") ? "built" : "contributed";
      currentProject = company || title;
      currentContribution = contrib as typeof currentContribution;
      experiences.push({ title: title.slice(0, 120), company: company.slice(0, 120), duration: duration.slice(0, 80), contribution_type: currentContribution });
      projects.push({ name: currentProject.slice(0, 120), description: title.slice(0, 200), technologies: [], ownership_level: contrib === "assisted" ? "supporting" : "shared", contribution_type: currentContribution });
      continue;
    }
    if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) {
      const bullet = line.replace(/^[•\-*]\s*/, "").trim();
      if (!bullet) continue;
      claims.push({ text: bullet.slice(0, 240), project: currentProject.slice(0, 120), strength: /[%×x]|95|200\+|12,/.test(bullet) ? "flagship" : "strong", contribution_type: currentContribution });
      if (projects.length > 0) {
        const techHits = splitTokens(bullet).filter((t) => /[A-Z]/.test(t) || ["python","c++","sql","docker","linux","tensorflow","mediapipe"].includes(t.toLowerCase()));
        const p = projects[projects.length - 1]!;
        for (const tech of techHits.slice(0, 8)) if (!p.technologies.includes(tech)) p.technologies.push(tech);
      }
    }
  }

  const yl = yearsExperience.toLowerCase();
  const tier: ParsedResume["experience_tier"] = /4|5|senior|staff/.test(yl) ? "senior" : /2|3|mid/.test(yl) ? "mid" : experiences.some((e) => e.title.toLowerCase().includes("intern")) ? "junior" : "junior";
  return { skills: skills.slice(0, 20), tools: tools.slice(0, 15), projects: projects.slice(0, 6), claims: claims.slice(0, 10), experiences: experiences.slice(0, 6), experience: { ml: 0, swe: 0, data_eng: 0 }, experience_tier: tier };
}

function _mergeResumeWithFallback(parsed: Partial<ParsedResume>, fallback: ParsedResume): ParsedResume {
  const merge = <T>(a: T | undefined, b: T): T => (Array.isArray(a) && (a as unknown[]).length > 0 ? a : Array.isArray(b) && (b as unknown[]).length > 0 ? b : (a ?? b)) as T;
  return {
    skills: merge(parsed.skills, fallback.skills),
    tools: merge(parsed.tools, fallback.tools),
    projects: merge(parsed.projects, fallback.projects),
    claims: merge(parsed.claims, fallback.claims),
    experiences: merge(parsed.experiences, fallback.experiences),
    experience: parsed.experience ?? fallback.experience,
    experience_tier: (parsed.experience_tier as ParsedResume["experience_tier"]) ?? fallback.experience_tier,
  };
}

export async function parseResume(resumeText: string, targetRole = "", yearsExperience = ""): Promise<ParsedResume> {
  const result = await callGeminiJson(
    `You are a resume parser. Extract ownership and contribution signals to calibrate interview pressure fairly.

Extract:
- skills (list of strings)
- tools (list of strings)
- projects (list) each with: name, description, technologies[], ownership_level (primary|shared|supporting), contribution_type (led|built|contributed|assisted)
- experiences (list) each with: title, company, duration, contribution_type (led|built|contributed|assisted)
- claims (list) each with: text, project, strength (modest|strong|flagship), contribution_type (led|built|contributed|assisted)
- experience: {ml: 0, swe: 0, data_eng: 0} (years per domain, estimate from context)
- experience_tier: junior|mid|senior

Return JSON only. No commentary.`,
    `Target role: ${targetRole || "not provided"}
Expected years of experience: ${yearsExperience || "not provided"}

Resume:
${resumeText.slice(0, 4000)}`,
    "fast"
  ) as Partial<ParsedResume> | null;

  const fallback = _heuristicParseResume(resumeText, yearsExperience);
  if (!result || typeof result !== "object") return fallback;
  return _mergeResumeWithFallback(result, fallback);
}

/** Build rich structured context from ParsedResume for LLM prompts — more specific than the profile-based version. */
export function buildStructuredResumeContext(parsedResume: ParsedResume | null | undefined, resumeText = ""): string {
  if (!parsedResume) return resumeText.slice(0, 2000);
  const { projects = [], skills = [], claims = [], tools = [], experiences = [], experience = {}, experience_tier = "" } = parsedResume;

  const claimText = (c: ParsedResume["claims"][number]) =>
    `${c.text} (project: ${c.project}) [${c.strength}/${c.contribution_type}]`;

  let ctx = `Skills: ${skills.slice(0, 15).join(", ")}\n`;
  ctx += `Tools: ${tools.slice(0, 10).join(", ")}\n`;
  if (Object.keys(experience).length) ctx += `Experience domain years: ${JSON.stringify(experience)}\n`;
  if (experience_tier) ctx += `Experience tier: ${experience_tier}\n`;
  if (experiences.length) {
    ctx += "Roles:\n" + experiences.slice(0, 4).map((e) =>
      `  - ${e.title} @ ${e.company} (${e.duration}) [${e.contribution_type}]`
    ).join("\n") + "\n";
  }
  if (projects.length) {
    ctx += "Projects:\n" + projects.slice(0, 5).map((p) =>
      `  - ${p.name}: ${p.description} [${p.technologies.slice(0, 5).join(", ")}] ownership=${p.ownership_level} contribution=${p.contribution_type}`
    ).join("\n") + "\n";
  }
  if (claims.length) {
    ctx += "Key claims: " + claims.slice(0, 6).map(claimText).join("; ");
  }
  return ctx;
}

// ── RESUME-AWARE WEAKNESS DETECTION ───────────────────────────────────────────

/** detectWeaknessWithResume — like detectWeakness but uses structured resume for ownership calibration. */
export async function detectWeaknessWithResume(
  question: string,
  answer: string,
  sprint: number,
  priorWeaknesses: { type?: string }[],
  parsedResume: ParsedResume | null,
  opts?: { tier?: "fast" | "balanced" }
): Promise<{
  weakness: string;
  type: string;
  severity: "low" | "medium" | "high";
  attackStrategy: string;
  suggestedFollowup?: string;
}> {
  const sprintFocus: Record<number, string> = {
    1: "Focus on: did they actually build this? Are they vague about their own contribution?",
    2: "Focus on: are they hand-waving fundamentals? Is reasoning mechanically correct?",
    3: "Focus on: are they ignoring trade-offs, failure modes, or scale implications?",
  };
  const focus = sprintFocus[sprint] ?? "";
  const priorContext = priorWeaknesses.length > 0
    ? `Already probed: ${priorWeaknesses.slice(-3).map((w) => w.type).join(", ")}. Avoid redundant detection.`
    : "";

  let calibrationContext = "";
  if (parsedResume) {
    const { experience_tier = "", projects = [], experiences = [] } = parsedResume;
    const ownershipSignals = [
      ...projects.slice(0, 3).map((p) => `${p.name}: ownership=${p.ownership_level} contribution=${p.contribution_type}`),
      ...experiences.slice(0, 2).map((e) => `${e.title} @ ${e.company}: contribution=${e.contribution_type}`),
    ];
    calibrationContext = `\nResume experience tier: ${experience_tier || "unknown"}`;
    if (ownershipSignals.length) calibrationContext += "\nOwnership signals:\n- " + ownershipSignals.join("\n- ");
  }

  const result = await callGeminiJson(
    `You are a technical interviewer analyzing a candidate's answer for reasoning gaps.

Do NOT validate or praise. Find the most important next probe.

Weakness types: missing_step | vague | incorrect | shallow | overconfidence | deflection | ambiguous_but_promising
Attack strategies: clarification | implementation_probe | ownership_probe | edge_case | scaling | contradiction | step_by_step
Severity: high (fundamental gap) | medium (incomplete) | low (minor)

IMPORTANT: If the candidate admits a gap or shows intellectual honesty, set severity to medium or low. Do NOT punish honesty.
Calibration: Use resume ownership signals to adjust bar. If candidate only had supporting/contributing ownership, do NOT hold them to a senior ownership bar.

Return JSON only:
{
  "weakness": "<one sentence>",
  "type": "missing_step|vague|incorrect|shallow|overconfidence|deflection|ambiguous_but_promising",
  "severity": "low|medium|high",
  "attack_strategy": "clarification|implementation_probe|ownership_probe|edge_case|scaling|contradiction|step_by_step",
  "suggestedFollowup": "<short probe idea, optional>"
}`,
    `Sprint ${sprint} — ${focus}\n${priorContext}${calibrationContext}\n\nQuestion: ${question}\n\nCandidate Answer: ${answer}`,
    opts?.tier ?? "balanced"
  ) as { weakness?: string; type?: string; severity?: string; attack_strategy?: string; suggestedFollowup?: string } | null;

  if (!result?.weakness) {
    return { weakness: "Vague answer", type: "vague", severity: "low", attackStrategy: "step_by_step" };
  }

  const HONEST_ADMISSION_RE = /to be honest|i don't know|i do not know|i didn't implement|i didn't build|i'm not sure|i haven't/i;
  let sev: "low" | "medium" | "high" = result.severity === "high" || result.severity === "medium" ? result.severity : "low";
  let wType = String(result.type ?? "vague");
  let atk = String(result.attack_strategy ?? "step_by_step");
  if (HONEST_ADMISSION_RE.test(answer)) {
    if (sev === "high") sev = "medium";
    wType = "ambiguous_but_promising";
    if (!atk.includes("clarif")) atk = "clarification";
  }

  return {
    weakness: String(result.weakness),
    type: wType,
    severity: sev,
    attackStrategy: atk,
    suggestedFollowup: typeof result.suggestedFollowup === "string" ? result.suggestedFollowup : undefined,
  };
}

// ── SEED QUESTION ─────────────────────────────────────────────────────────────

/** Generate the first follow-up question from resume BEFORE the candidate has answered. Pre-seeds Turn 1 fast path. */
export async function generateSeedQuestion(sprint: number, persona: string, resumeContext: string): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead!;
  const text = await callGeminiText(
    system,
    `Sprint ${sprint} — ${SPRINT_GOALS[sprint] ?? ""}

Candidate background:
${resumeContext}

The candidate has just been asked: "Tell me about a project you're genuinely proud of."
Before they've answered, generate ONE follow-up you'll ask after they respond.
The question should:
- Reference a specific project, technology, or claim from their resume
- Dig into personal contribution or a key implementation decision
- Be ≤20 words, conversational

Output only the question.`,
    "fast",
    { maxOutputTokens: 120 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || "What part of that project was most dependent on your own implementation choices?";
}

// ── SPRINT OPENER ─────────────────────────────────────────────────────────────

/** Generate a smooth sprint-transition question that builds on the prior sprint. */
export async function generateSprintOpener(
  sprint: number,
  persona: string,
  resumeContext: string,
  priorSprintHistory: { question?: string; answer?: string; focus_label?: string }[],
  opts?: {
    transitionBrief?: string;
    avoidTopics?: string[];
    focusContext?: string;
  }
): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead!;

  const priorSummary = priorSprintHistory.length > 0
    ? "What we just covered:\n" + priorSprintHistory.slice(-4).map((t, i) =>
        `  Q${i + 1}: ${(t.question ?? "").slice(0, 120)}\n  A${i + 1}: ${(t.answer ?? "").slice(0, 180)}`
      ).join("\n")
    : "";

  const transitionContext: Record<number, string> = {
    2: "Transition from project exploration into the technical concepts underlying the work. Reference a specific technology or decision from the previous sprint.",
    3: "Transition from conceptual discussion into system design and trade-offs. Reference something concrete — scale it up, introduce a constraint, or ask about failure modes.",
  };

  const avoidSection = opts?.avoidTopics?.length
    ? `⚠️ Do NOT re-center on these already-exhausted topics:\n${opts.avoidTopics.map((t) => `- ${t}`).join("\n")}\n`
    : "";

  const text = await callGeminiText(
    system,
    `You are opening Sprint ${sprint} of the interview.

Sprint ${sprint} goal: ${SPRINT_GOALS[sprint] ?? ""}
Transition guidance: ${transitionContext[sprint] ?? ""}

Candidate background:
${resumeContext}

${opts?.focusContext ? `Current focus context:\n${opts.focusContext}\n` : ""}
${priorSummary}
${opts?.transitionBrief ? `Transition memory:\n${opts.transitionBrief}\n` : ""}${avoidSection}

Write ONE transition question that:
- Feels like a natural continuation (not a cold start)
- References something specific from the prior sprint or the candidate's resume
- Opens the new sprint goal without immediately going deep
- Signals the transition explicitly: "Staying with...", "Switching to...", or "On the systems side of..."
- Is conversational and clear — a senior engineer talking to a peer

Output only the question.`,
    "balanced",
    { maxOutputTokens: 200 }
  );

  const fallbacks: Record<number, string> = {
    2: "You mentioned technical work in your background — let's go deeper on one concept that made it actually work. What's the core idea you had to understand most deeply?",
    3: "Based on what you've described, if that system had to scale sharply, what part would you redesign first to handle the load?",
  };
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || fallbacks[sprint] || "What aspect of your technical work best shows your depth?";
}

// ── SPECULATIVE PRE-GENERATION ─────────────────────────────────────────────────

/**
 * Event-driven speculative question from partial transcript — fast model only, never blocks the fast path.
 * Triggered by new entities appearing in partial transcript or admission/gap signals.
 */
export async function generateSpeculative(
  partialText: string,
  newEntities: string[],
  lastQuestion: string,
  persona: string,
  sprint: number,
  resumeContext: string,
  opts?: {
    admission?: boolean;
    currentBestQuestion?: string;
    shortAnswerRescue?: boolean;
    focusContext?: string;
    currentMapCandidate?: string;
  }
): Promise<{ action: "keep" | "replace"; question: string }> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead!;
  const existing = opts?.currentBestQuestion?.trim() ?? "";
  const mapCandidate = opts?.currentMapCandidate?.trim() ?? "";
  const fallback = opts?.admission
    ? "What part of that are you most confident about, even if the rest was handled by the framework?"
    : opts?.shortAnswerRescue
      ? "What exactly in that answer is the key detail you want me to understand?"
      : "Say more about the specific mechanism you used there.";

  let direction: string;
  if (opts?.admission) {
    direction = "The candidate appears to be admitting a gap. Generate a curious follow-up that rewards honesty — pivot to what they DO know.";
  } else if (newEntities.length > 0) {
    direction = `The candidate just introduced: ${newEntities.slice(0, 3).join(", ")}. Generate a follow-up that digs one level deeper into one of these.`;
  } else if (opts?.shortAnswerRescue) {
    direction = "The candidate gave a very short answer. Generate a light rescue follow-up that stays attached to what they said.";
  } else {
    direction = "Generate a deepening follow-up grounded in what the candidate just said.";
  }

  const currentBestSection = existing
    ? `\nCurrent best speculative follow-up:\n"${existing.slice(0, 180)}"\n\nIf the new transcript does NOT materially improve this, keep it.`
    : "";
  const mapSection = mapCandidate
    ? `\nInterview-map candidate question:\n"${mapCandidate.slice(0, 180)}"\n\nIf this is more grounded than the current speculative, prefer it.`
    : "";

  const text = await callGeminiText(
    system,
    `Sprint ${sprint} — partial transcript so far:
"${partialText.slice(-400)}"

Last question asked: ${lastQuestion.slice(0, 150)}

Candidate background:
${resumeContext.slice(0, 300)}

${opts?.focusContext ? `Focus context:\n${opts.focusContext}\n` : ""}
${direction}
${currentBestSection}
${mapSection}

Return ONLY one of these three responses (no commentary):
- If current best is still good: KEEP
- If map candidate is better: USE_MAP
- Otherwise: output the replacement question text (≤20 words, specific, grounded)`,
    "fast",
    { maxOutputTokens: 80 }
  );

  const raw = text.replace(/^["']|["']$/g, "").trim();

  if (/^keep$/i.test(raw) && existing) return { action: "keep", question: existing };
  if (/^use_map$/i.test(raw) && mapCandidate) return { action: "replace", question: mapCandidate };
  if (raw.length > 8) return { action: "replace", question: raw };
  if (existing) return { action: "keep", question: existing };
  return { action: "replace", question: fallback };
}

// ── RESUME-AWARE FOLLOWUP GENERATION ──────────────────────────────────────────

/**
 * Generate a targeted attack probe using resume context and focus area.
 * Richer than generateWeaknessFollowup — grounds the question in a specific resume snippet.
 */
export async function generateWeaknessFollowupWithResume(
  question: string,
  answer: string,
  weakness: { weakness?: string; attackStrategy?: string; type?: string },
  persona: string,
  parsedResume: ParsedResume | null,
  resumeText: string,
  opts?: {
    focusContext?: string;
    resumeSnippets?: string[];
    recentAsked?: string[];
  }
): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead!;
  const resumeContext = buildStructuredResumeContext(parsedResume, resumeText);
  const attackStrategy = weakness.attackStrategy ?? "step_by_step";
  const strategyInstructions: Record<string, string> = {
    clarification: "Ask one exploratory clarifying question that establishes mechanism, scope, or ownership before escalating.",
    implementation_probe: "Ask them to walk through the actual implementation step-by-step. Push for the specific mechanism.",
    ownership_probe: "Pin down their personal contribution versus team contribution. Ask exactly what they themselves built.",
    step_by_step: "Ask them to reason through it explicitly, step by step.",
    contradiction: "Surface a contradiction between what they said and what's true — direct but not accusatory.",
    edge_case: "Introduce a specific edge case that breaks their assumption and ask how their approach holds.",
    scaling: "Push the scale until their approach breaks. Ask what fails first.",
  };
  const focusBlock = opts?.focusContext
    ? `\nCurrent focus: ${opts.focusContext}`
    : opts?.resumeSnippets?.length
      ? `\nExact resume snippets:\n${opts.resumeSnippets.slice(0, 3).map((s) => `- ${s}`).join("\n")}`
      : "";

  const text = await callGeminiText(
    system,
    `Candidate background:
${resumeContext.slice(0, 900)}
${focusBlock}

Previous question: ${question}
Candidate's answer: ${answer}

Weakness: ${weakness.weakness ?? ""}
Attack strategy: ${attackStrategy}
How to execute: ${strategyInstructions[attackStrategy] ?? strategyInstructions.step_by_step}

Generate ONE follow-up question executing this attack strategy.
Ground it in something specific from their resume or answer.
${formatAskedQuestionsBlock(opts?.recentAsked ?? [])}
Follow the medium-length rubric in your system instructions.`,
    "balanced",
    { maxOutputTokens: 320 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || "Can you walk me through that in more concrete detail?";
}

/** Generate a sprint question with trajectory map hint and avoid-topic guardrails. */
export async function generateSprintQuestionWithResume(
  sprint: number,
  persona: string,
  parsedResume: ParsedResume | null,
  resumeText: string,
  history: { question?: string }[],
  opts?: {
    recentAsked?: string[];
    nonTechnical?: boolean;
    subtrack?: NonTechSubtrack;
    dataTrack?: boolean;
    dataSubtrack?: DataSubtrack;
    trajectoryHintQuestion?: string;
    avoidTopics?: string[];
    pivotingHint?: boolean;
    focusContext?: string;
    resumeSnippets?: string[];
  }
): Promise<string> {
  const resumeContext = buildStructuredResumeContext(parsedResume, resumeText);
  const fromHist = history.map((h) => h.question).filter(Boolean) as string[];
  const merged = [...new Set([...(opts?.recentAsked ?? []), ...fromHist].filter(Boolean))].slice(-18);
  const covered = merged.length ? merged.join("\n- ") : "(none yet)";

  let system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead!;
  if (opts?.nonTechnical) {
    system += "\n\nYou are interviewing for a non-technical professional role. Emphasize communication, stakeholder dynamics, and domain judgment.";
  } else if (opts?.dataTrack) {
    system += "\n\nYou are interviewing a DATA TRACK candidate. Prioritize data pipelines, SQL/analytical reasoning, stats/ML, and data quality.";
  }

  const sprintGoal = opts?.nonTechnical
    ? (NON_TECH_SPRINT_GOALS[sprint] ?? "")
    : opts?.dataTrack
      ? (DATA_SPRINT_GOALS[sprint] ?? "")
      : (SPRINT_GOALS[sprint] ?? "");

  const trajectorySection = opts?.trajectoryHintQuestion?.trim()
    ? `\nInterview-map candidate question (use as grounded backbone if helpful):\n- ${opts.trajectoryHintQuestion}`
    : "";

  const avoidSection = opts?.avoidTopics?.length
    ? `\n⚠️ MANDATORY — Do NOT ask about these already-exhausted topics:\n${opts.avoidTopics.map((t) => `- ${t}`).join("\n")}\nPick a different project or claim.`
    : "";

  const focusBlock = opts?.focusContext
    ? `\nCurrent focus context:\n${opts.focusContext}`
    : opts?.resumeSnippets?.length
      ? `\nExact resume snippets:\n${opts.resumeSnippets.slice(0, 3).map((s) => `- ${s}`).join("\n")}`
      : "";

  const text = await callGeminiText(
    system,
    `Sprint goal: ${sprintGoal}

Candidate background:
${resumeContext.slice(0, 900)}
${focusBlock}
Questions already asked — do NOT repeat:
- ${covered}
${trajectorySection}${avoidSection}

Generate ONE question that:
- Directly references something specific from their resume (project by name, technology, claim)
- Aligns with the sprint goal
- Has not been covered already
${opts?.pivotingHint ? "- This is a pivot turn. Explicitly name the new project/tech context in the question." : "- If staying on the same project, explicit continuity phrasing is preferred."}

Output only the question. Follow the medium-length rubric in your system instructions.`,
    "balanced",
    { maxOutputTokens: 340 }
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || (opts?.nonTechnical ? "Walk me through a situation where you aligned stakeholders under ambiguity." : "Tell me about a technical challenge you faced recently.");
}
