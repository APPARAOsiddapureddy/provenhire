/**
 * Adversarial AI interview agents — Gemini-backed (same stack as ai.service).
 * JSON agents parse structured output; follow-up phrasing uses plain text generation.
 */
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
      if (match) return JSON.parse(match[0]);
      return null;
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
): Promise<{ weakness: string; type: string; severity: "low" | "medium" | "high"; attackStrategy: string }> {
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

Weakness types: missing_step | vague | incorrect | shallow | overconfidence
Attack strategies: implementation_probe | edge_case | scaling | contradiction | step_by_step
Severity: high (must probe) | medium (worth following up) | low (minor)

Return JSON only:
{
  "weakness": "<one sentence describing the specific gap>",
  "type": "missing_step | vague | incorrect | shallow | overconfidence",
  "severity": "low | medium | high",
  "attackStrategy": "implementation_probe | edge_case | scaling | contradiction | step_by_step"
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
    return { weakness: "Vague answer", type: "vague", severity: "low", attackStrategy: "step_by_step" };
  }
  const sev = result.severity === "high" || result.severity === "medium" ? result.severity : "low";
  return {
    weakness: String(result.weakness),
    type: String(result.type ?? "vague"),
    severity: sev,
    attackStrategy: String(result.attackStrategy ?? "step_by_step"),
  };
}

// ── DISCREPANCY AGENT ─────────────────────────────────────────────────────────
export async function checkDiscrepancy(
  resume: string,
  answer: string
): Promise<{ conflict: boolean; description: string; severity: "low" | "high" }> {
  const result = (await callGeminiJson(
    `Compare resume claims vs candidate explanation. Detect inconsistencies between what they claim to have built/know and what they demonstrate.
Return JSON: {"conflict": true/false, "description": "...", "severity": "low | high"}`,
    `Resume:\n${resume.slice(0, 2000)}\n\nCandidate Explanation:\n${answer}`,
    "balanced"
  )) as { conflict?: boolean; description?: string; severity?: string } | null;
  if (!result) return { conflict: false, description: "", severity: "low" };
  return {
    conflict: Boolean(result.conflict),
    description: String(result.description ?? ""),
    severity: result.severity === "high" ? "high" : "low",
  };
}

// ── REASONING BEHAVIOR AGENT ──────────────────────────────────────────────────
export async function evaluateReasoning(answer: string, wasChallenged: boolean): Promise<Record<string, unknown>> {
  const result = await callGeminiJson(
    `Evaluate HOW the candidate thinks and communicates. Do NOT evaluate technical accuracy.
Track: structure (do they enumerate steps?), clarification behavior, adaptability, confidence calibration.
Return JSON: {"structureScore": 0-3, "clarificationBehavior": "asks|assumes|mixed", "adaptability": "flexible|rigid|defensive", "confidenceCalibration": "calibrated|overconfident|underconfident"}`,
    `Candidate was challenged: ${wasChallenged}\n\nAnswer:\n${answer}`,
    "balanced"
  );
  return (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
}

// ── FOLLOWUP AGENT ────────────────────────────────────────────────────────────
const PERSONA_PROMPTS: Record<string, string> = {
  curious_lead: `You are a Curious Lead interviewer. Ask ONE follow-up that digs deeper into their specific work. Be genuinely curious, not confrontational. Reference something specific they said. Output only the question text, no preamble.`,
  socratic_mentor: `You are a Socratic Mentor. Ask ONE question that tests whether they truly understand the concept underneath their answer — not facts, but reasoning. Output only the question text.`,
  senior_peer: `You are a Senior Peer thinking through a real engineering problem together. Ask ONE question about trade-offs, failure modes, or scaling. Treat them as a peer. Output only the question text.`,
};

const ATTACK_INSTRUCTIONS: Record<string, string> = {
  implementation_probe:
    "Ask them to walk through the actual implementation step-by-step. They were vague — push for the specific mechanism.",
  step_by_step: "Ask them to reason through it explicitly step by step.",
  contradiction: "Surface a contradiction directly but without accusation. Reference what they said earlier.",
  edge_case: "Introduce a specific scenario that breaks their assumption.",
  scaling: "Push the scale: what's the first thing that breaks at 100x?",
};

const SPRINT_GOALS: Record<number, string> = {
  1: "Build a clear picture of the candidate's most significant project — the problem it solved, why they built it this way, what they personally contributed, and what challenges they faced.",
  2: "Explore the candidate's conceptual understanding of the technical ideas underlying their work — not trivia, but genuine reasoning about how things work and why.",
  3: "Think through real engineering trade-offs together — scaling decisions, failure modes, design alternatives. Treat it as a collaborative discussion.",
};

export async function generateWeaknessFollowup(
  question: string,
  answer: string,
  weakness: { weakness?: string; attackStrategy?: string },
  persona: string,
  resumeContext: string
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
Generate ONE follow-up question executing this strategy. Ground it in something specific from their answer.`,
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
  resumeContext: string
): Promise<string> {
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;

  const text = await callGeminiText(
    system,
    `Candidate background: ${resumeContext.slice(0, 800)}
Previous question: ${question}
Candidate's answer: ${answer}
Discrepancy: ${discrepancy.description ?? ""}
Generate ONE question that surfaces this inconsistency — curious and direct, not accusatory. Give them a chance to explain.`,
    "balanced"
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || "Can you tell me more about your specific role in that?";
}

export async function generateSprintQuestion(
  sprint: number,
  persona: string,
  resumeContext: string,
  history: { question?: string }[]
): Promise<string> {
  const covered = history
    .slice(-6)
    .map((h) => h.question)
    .filter(Boolean)
    .join("\n- ");
  const system = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.curious_lead;

  const text = await callGeminiText(
    system,
    `Sprint goal: ${SPRINT_GOALS[sprint] ?? ""}
Candidate background: ${resumeContext.slice(0, 800)}
Questions already asked — do NOT repeat:
- ${covered || "(none yet)"}
Generate ONE new interview question that directly references something specific from their background and aligns with the sprint goal.`,
    "balanced"
  );
  const q = text.replace(/^["']|["']$/g, "").trim();
  return q || "Tell me about a technical challenge you faced recently.";
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
Generate 2 short follow-up questions that dig deeper, grounded in their specific background.
Return JSON: {"questions": ["...", "..."]}`,
    "fast"
  )) as { questions?: string[] } | null;

  return Array.isArray(result?.questions) ? result.questions.map(String).slice(0, 2) : [];
}

// ── EVALUATION AGENT ──────────────────────────────────────────────────────────
export async function evaluateFullInterview(
  history: {
    sprint?: number;
    persona?: string;
    question?: string;
    answer?: string;
  }[],
  resume: string,
  weaknesses: { type?: string; severity?: string; weakness?: string }[],
  reasoningSignals: { structureScore?: number }[]
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

  const result = await callGeminiJson(
    `You are evaluating a complete adversarial technical interview across 3 sprints.
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
  "final_verdict": "<2-3 sentences for candidate>",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "authenticity_concern": false,
  "authenticity_reason": ""
}`,
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
