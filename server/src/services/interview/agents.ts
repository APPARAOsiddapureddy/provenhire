/**
 * Adversarial AI interview agents — Gemini-backed (same stack as ai.service).
 * JSON agents parse structured output; follow-up phrasing uses plain text generation.
 */
import type { NonTechSubtrack } from "../../constants/verificationPipeline.js";
import { GoogleGenAI } from "@google/genai";

const geminiApiKey = process.env.GEMINI_API_KEY;
const gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

function responseText(response: unknown): string {
  return String((response as { text?: string })?.text ?? "").trim();
}

async function callGeminiJson(system: string, user: string, tier: "fast" | "balanced" | "deep"): Promise<unknown> {
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

async function callGeminiText(system: string, user: string, tier: "fast" | "balanced" | "deep"): Promise<string> {
  if (!gemini) return "";
  const model =
    tier === "fast" ? "gemini-2.0-flash" : tier === "deep" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  try {
    const response = await gemini.models.generateContent({
      model,
      contents: `${system}\n\n${user}`,
      config: { temperature: 0.35 },
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
  priorWeaknesses: { type?: string }[]
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
    "balanced"
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
  answer: string
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
    "balanced"
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

// ── REASONING BEHAVIOR AGENT ──────────────────────────────────────────────────
export type ReasoningBehaviorOutput = {
  structureScore: number;
  clarificationBehavior: string;
  adaptability: "flexible" | "rigid" | "defensive";
  confidenceCalibration: "calibrated" | "overconfident" | "underconfident";
};

export async function evaluateReasoning(answer: string, wasChallenged: boolean): Promise<ReasoningBehaviorOutput> {
  const result = (await callGeminiJson(
    `Evaluate HOW the candidate thinks and communicates. Do NOT evaluate technical accuracy.
Track: structure (do they enumerate steps?), clarification behavior, adaptability, confidence calibration.
Return JSON: {"structureScore": 0-3, "clarificationBehavior": "asks_clarification|answers_directly|avoids|mixed", "adaptability": "flexible|rigid|defensive", "confidenceCalibration": "calibrated|overconfident|underconfident"}`,
    `Candidate was challenged: ${wasChallenged}\n\nAnswer:\n${answer}`,
    "balanced"
  )) as Record<string, unknown> | null;
  const r = result && typeof result === "object" ? result : {};
  const adapt = String(r.adaptability ?? "rigid");
  const conf = String(r.confidenceCalibration ?? "calibrated");
  return {
    structureScore: Math.min(3, Math.max(0, Number(r.structureScore) || 0)),
    clarificationBehavior: String(r.clarificationBehavior ?? "answers_directly"),
    adaptability:
      adapt === "flexible" || adapt === "defensive" ? adapt : "rigid",
    confidenceCalibration:
      conf === "overconfident" || conf === "underconfident" ? conf : "calibrated",
  };
}

/** Soften model weakness when reasoning shows honest calibration (in addition to regex in detectWeakness). */
export function applyReasoningHonestyCap(
  weakness: { type?: string; severity?: string; attackStrategy?: string },
  reasoning: ReasoningBehaviorOutput
): void {
  if (reasoning.adaptability === "flexible" && reasoning.confidenceCalibration === "calibrated") {
    if (weakness.severity === "high") weakness.severity = "medium";
    weakness.type = "calibration_success";
    weakness.attackStrategy = "explore_depth";
  }
}

// ── FOLLOWUP AGENT ────────────────────────────────────────────────────────────

/** Shared rubric: medium conversational questions (voice interview). */
const MEDIUM_QUESTION_RUBRIC = `Ask a medium-length question: 2 to 4 sentences.
Start with a brief setup or context (1–2 sentences) so the candidate understands exactly what angle you are exploring, then ask the specific question.
Do not ask multiple unrelated questions in one turn — end with exactly one clear question, with exactly one question mark for the main ask.
Sound natural and conversational, like a senior engineer speaking — not a quiz.
Never start with thanks, thank you, praise, or hollow enthusiasm — jump straight to the substance.

GOOD (medium-length, specific):
"You mentioned using Redis for caching in your project. Walk me through how you decided what to cache and what not to — what was your thinking on cache invalidation?"

"That's an interesting approach to the problem. I want to understand the trade-off you made there — when would your solution start to break down, and what would you do differently at 10x scale?"

BAD (too short — do not generate these):
"Why Redis?"
"What are the trade-offs?"
"Explain caching."

BAD (too long — do not generate):
More than four sentences, or a long lecture before they hear what you want them to answer.

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
    "In 2–4 sentences, ask them to walk through the exact mechanism or data path with concrete details.",
  step_by_step:
    "In 2–4 sentences, ask them to reason through the steps in order and where each could fail.",
  contradiction:
    "In 2–4 sentences, surface the inconsistency directly but calmly, and give them room to clarify.",
  edge_case: "In 2–4 sentences, introduce a specific breaking scenario and ask how their design behaves.",
  scaling: "In 2–4 sentences, push scale (e.g. 10x traffic or data) and ask what breaks first and why.",
  explore_depth:
    "In 2–4 sentences, ask one precise follow-up that deepens understanding without repeating prior questions.",
};

/** Markers suggesting intellectual honesty — do not treat as evasion. */
const HONEST_ADMISSION_RE =
  /to be honest|i don't know|i do not know|i should be clear|it's basically just|it is basically just|actually it's more like|actually it is more like|i should be precise|i am not sure|i'm not sure|i was wrong|i made a mistake/i;

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
    "balanced"
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
    "balanced"
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
Rewrite into ONE medium-length spoken question (2–4 sentences). Same intent as the template. No thanks or filler — output only the question.`,
    "balanced"
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
  opts?: { nonTechnical?: boolean; subtrack?: NonTechSubtrack }
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
  }

  const sprintGoal = opts?.nonTechnical ? NON_TECH_SPRINT_GOALS[sprint] ?? "" : SPRINT_GOALS[sprint] ?? "";
  const subAngle =
    opts?.nonTechnical && opts.subtrack ? NON_TECH_SUBTRACK_CAL[opts.subtrack] ?? "" : "";

  const text = await callGeminiText(
    system,
    `Sprint goal: ${sprintGoal}
${subAngle ? `Calibration: ${subAngle}\n` : ""}Candidate background: ${resumeContext.slice(0, 800)}
Questions already asked — do NOT repeat or ask the same angle again:
- ${covered}
Your next question must open a meaningfully different line of inquiry (new sub-topic, trade-off, or concrete detail), not a minor rewording of any line above.

Generate ONE question that opens a meaningfully new line of inquiry. Follow the medium-length rubric in your system instructions.`,
    "balanced"
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
Generate 2 distinct follow-up questions (different angles; not paraphrases). Each should be 2–3 sentences, medium-length, no "thank you" or praise — questions only.
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

  const result = await callGeminiJson(
    `You are evaluating a complete adversarial ${meta?.nonTechnical ? "professional " : "technical "}interview across 3 sprints.
You must produce TWO SEPARATE assessments:
1) claim_credibility_risk: were specific resume claims substantiated in dialogue? (none | low | medium | high)
2) engineering_signal: overall ${meta?.nonTechnical ? "professional" : "engineering"} ability independent of claim disputes (strong | moderate | inconclusive | weak)
${nonTechBlock}

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
