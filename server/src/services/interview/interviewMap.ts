/**
 * Resume-grounded interview map / trajectory spine.
 *
 * Ported from Antigravity's interview_map.py.
 * Builds a structured per-focus question bank at session start so the fast path
 * always has resume-grounded fallback questions — even when the LLM slow path
 * hasn't finished staging the next adversarial probe.
 *
 * Architecture:
 *   Step 1 — Gemini Flash reads the raw resume and extracts 3-5 focus area seeds.
 *   Step 2 — Gemini Pro generates per-sprint branching tracks for each focus area in parallel.
 *   Result  — A JSON map stored in questionPlan.interview_trajectory_map.
 *
 * Consumed by selectFromTrajectoryMap() in the fast path when prepped_next_question is absent/weak.
 */

import { callGeminiJson, callGeminiText } from "./agents.js";

// ── TYPES ──────────────────────────────────────────────────────────────────────

export interface FocusAreaTrack {
  if_strong: string;
  if_vague: string;
  if_honest_gap: string;
  if_claim_conflict: string;
  if_short_answer: string;
  bridge_to_next_focus: string;
}

export interface FocusArea {
  label: string;
  focus_key: string;
  anchor_context: string;
  resume_snippets: string[];
  sprint_1: FocusAreaTrack;
  sprint_2: FocusAreaTrack;
  sprint_3: FocusAreaTrack;
}

export interface InterviewMap {
  focus_areas: FocusArea[];
  generated_at: number;
}

// ── CONSTANTS ──────────────────────────────────────────────────────────────────

const VALID_BRANCHES = new Set([
  "if_strong", "if_vague", "if_honest_gap", "if_claim_conflict", "if_short_answer", "bridge_to_next_focus",
]);

const SPRINT_KEYS = ["sprint_1", "sprint_2", "sprint_3"] as const;

const BRANCH_PRIORITY_DEFAULT = ["if_vague", "if_strong", "bridge_to_next_focus"];
const BRANCH_PRIORITY_SHORT = ["if_short_answer", "if_vague", "if_strong", "bridge_to_next_focus"];
const BRANCH_PRIORITY_ADMISSION = ["if_honest_gap", "if_vague", "if_strong", "bridge_to_next_focus"];
const BRANCH_PRIORITY_DISCREPANCY = ["if_claim_conflict", "if_vague", "if_strong", "bridge_to_next_focus"];

const BRANCH_TO_ROUTE: Record<string, string> = {
  if_short_answer: "trajectory_map_short_answer_rescue",
  if_honest_gap: "trajectory_map_honesty_probe",
  if_claim_conflict: "trajectory_map_challenge",
  bridge_to_next_focus: "trajectory_map_bridge",
  if_strong: "trajectory_map_strong_followup",
  if_vague: "trajectory_map_followup",
};

const GENERIC_PHRASES = [
  "what would you do differently",
  "walk me through your thinking",
  "say more about",
  "tell me more",
  "can you elaborate",
  "where does your mental model",
];

const SNIPPET_STOPWORDS = new Set([
  "with", "from", "that", "this", "these", "those", "their", "there", "into",
  "using", "used", "built", "build", "engineered", "worked", "project", "projects",
  "present", "current", "technical", "skills", "experience", "assistant", "intern",
  "research", "school", "university",
]);

// ── HELPERS ────────────────────────────────────────────────────────────────────

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function compactFocusKey(label: string, proposed = "", maxTokens = 6): string {
  const ignored = new Set(["ai", "ml", "engineering", "engineer", "intern", "internship", "project", "projects", "system", "systems", "work", "experience", "built", "using", "with", "custom", "full", "stack"]);
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const source of [proposed, label]) {
    for (const token of (source || "").toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      if (token.length <= 2 || ignored.has(token) || seen.has(token)) continue;
      tokens.push(token);
      seen.add(token);
      if (tokens.length >= maxTokens) return tokens.join("_");
    }
  }
  return normalizeKey(proposed || label);
}

function tokenize(text: string): Set<string> {
  return new Set(
    (text || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => t.length > 2 && !SNIPPET_STOPWORDS.has(t)) ?? []
  );
}

function resumeUnits(resume: string): string[] {
  return resume.split("\n")
    .map((l) => l.replace(/\s+/g, " ").replace(/•/g, " ").trim())
    .filter((l) => l.length >= 12 && !/^[-–—:| ]+$/.test(l));
}

function isNoiseSnippet(unit: string): boolean {
  const lower = unit.toLowerCase();
  if (unit.includes("@") && unit.includes(".") && unit.split(/\s+/).length <= 8) return true;
  if (/^[0-9+| :/().\-]+$/.test(unit)) return true;
  if (lower.startsWith("technical skills") || lower === "experience:") return true;
  return false;
}

function extractResumeSnippets(resume: string, seed: { label?: string; anchor_context?: string }, limit = 3): string[] {
  const units = resumeUnits(resume);
  if (!units.length) return [];
  const queryTokens = tokenize(`${seed.label ?? ""} ${seed.anchor_context ?? ""}`);
  if (!queryTokens.size) return [];

  const scored: Array<[number, number, string]> = [];
  for (const unit of units) {
    if (isNoiseSnippet(unit)) continue;
    const unitTokens = tokenize(unit);
    if (!unitTokens.size) continue;
    const overlap = [...queryTokens].filter((t) => unitTokens.has(t)).length;
    if (!overlap) continue;
    const bonus = (seed.label ?? "").toLowerCase().includes(unit.toLowerCase()) ? 2 : 0;
    scored.push([overlap + bonus, unitTokens.size, unit]);
  }
  scored.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const snippets: string[] = [];
  for (const [, , unit] of scored) {
    if (!snippets.includes(unit)) snippets.push(unit);
    if (snippets.length >= limit) break;
  }
  return snippets;
}

function fallbackFocusSeedsFromResume(resume: string, limit = 5): Array<{ label: string; focus_key: string; anchor_context: string }> {
  const seeds: Array<{ label: string; focus_key: string; anchor_context: string }> = [];
  const seen = new Set<string>();
  for (const unit of resumeUnits(resume)) {
    const lower = unit.toLowerCase();
    if (isNoiseSnippet(unit)) continue;
    if (!["intern", "engineer", "assistant", "@", "pipeline", "project"].some((m) => lower.includes(m))) continue;
    let label = unit.split(":")[0]!.trim().replace(/^[-\s]+|[-\s]+$/g, "");
    if (label.includes("@")) label = label.split("@")[0]!.trim().replace(/^[-\s]+|[-\s]+$/g, "");
    if (label.length > 80) label = label.slice(0, 80).split(" ").slice(0, -1).join(" ");
    const focusKey = compactFocusKey(label);
    if (!focusKey || seen.has(focusKey)) continue;
    seeds.push({ label, focus_key: focusKey, anchor_context: unit.slice(0, 220) });
    seen.add(focusKey);
    if (seeds.length >= limit) break;
  }
  return seeds;
}

function fallbackTrack(seed: { label?: string; anchor_context?: string }, nextFocusLabel: string): Record<string, FocusAreaTrack> {
  const label = (seed.label ?? "this work").trim();
  const focus = label.split(" ").length <= 6 ? label : (seed.anchor_context?.split(/[|;]/)[0]?.trim() ?? label);
  const f = focus;
  return {
    sprint_1: {
      if_strong: `In ${f}, which implementation choice most affected the result?`,
      if_vague: `In ${f}, what exact piece did you personally design or implement?`,
      if_honest_gap: `That's helpful. In ${f}, which part did you understand most deeply yourself?`,
      if_claim_conflict: `Your resume suggests strong ownership in ${f}. Which concrete piece did you actually build?`,
      if_short_answer: `Staying with ${f}, what specific detail should I understand from that answer?`,
      bridge_to_next_focus: `Before we move on, how does ${f} connect to ${nextFocusLabel}?`,
    },
    sprint_2: {
      if_strong: `In ${f}, which core technical idea mattered most and why?`,
      if_vague: `For ${f}, what mechanism actually made it work under the hood?`,
      if_honest_gap: `Even if you didn't build all of ${f}, what concept there do you understand best?`,
      if_claim_conflict: `You mention ${f} confidently on your resume. Which underlying concept did you personally reason about?`,
      if_short_answer: `When you answer briefly about ${f}, what concrete mechanism are you pointing to?`,
      bridge_to_next_focus: `Keeping ${f} in mind, what related area from your background should we examine next?`,
    },
    sprint_3: {
      if_strong: `If ${f} had to scale sharply, what part would you redesign first?`,
      if_vague: `What would be the first real reliability risk if ${f} faced heavier production load?`,
      if_honest_gap: `If you didn't own all of ${f}, which design trade-off there can you still reason about confidently?`,
      if_claim_conflict: `If ${f} were pushed harder in production, where would your current design story start to break?`,
      if_short_answer: `For ${f}, what specific bottleneck or failure mode are you referring to?`,
      bridge_to_next_focus: `Using ${f} as a bridge, how would you contrast it with ${nextFocusLabel}?`,
    },
  };
}

function isGenericOrOffFocus(question: string, seed: { label?: string; anchor_context?: string }): boolean {
  const cleaned = question.toLowerCase();
  if (!cleaned) return true;
  if (GENERIC_PHRASES.some((p) => cleaned.includes(p))) {
    const anchor = (seed.anchor_context ?? "").toLowerCase();
    const anchorTokens = (anchor.match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 3);
    if (!anchor || !anchorTokens.some((t) => cleaned.includes(t))) return true;
  }
  const anchorTokens = new Set(
    `${seed.label ?? ""} ${seed.anchor_context ?? ""}`.toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => t.length > 3) ?? []
  );
  if (anchorTokens.size > 0) {
    const questionTokens = new Set(cleaned.match(/[a-z0-9]+/g) ?? []);
    if (![...anchorTokens].some((t) => questionTokens.has(t))) return true;
  }
  return false;
}

function parseTrackOutput(raw: unknown, seed: { label?: string; anchor_context?: string }, fallback: Record<string, FocusAreaTrack>): Record<string, FocusAreaTrack> {
  let result: Record<string, unknown>;
  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "");
    result = JSON.parse(cleaned) as Record<string, unknown>;
  } else if (typeof raw === "object" && raw !== null) {
    result = raw as Record<string, unknown>;
  } else {
    throw new Error(`Unexpected track output type: ${typeof raw}`);
  }

  const cleaned: Record<string, FocusAreaTrack> = {};
  for (const sprintKey of SPRINT_KEYS) {
    const track = (typeof result[sprintKey] === "object" && result[sprintKey] !== null ? result[sprintKey] : {}) as Record<string, string>;
    const fallbackTrackBranch = fallback[sprintKey] ?? {} as FocusAreaTrack;
    const cleanedTrack: Partial<FocusAreaTrack> = {};
    for (const branch of VALID_BRANCHES) {
      const value = String(track[branch] ?? "").trim().replace(/\s+/g, " ");
      if (value && !isGenericOrOffFocus(value, seed)) {
        cleanedTrack[branch as keyof FocusAreaTrack] = value;
      } else {
        const fb = fallbackTrackBranch[branch as keyof FocusAreaTrack] ?? "";
        cleanedTrack[branch as keyof FocusAreaTrack] = fb;
      }
    }
    const missing = [...VALID_BRANCHES].filter((b) => !cleanedTrack[b as keyof FocusAreaTrack]);
    if (missing.length > 0) {
      throw new Error(`${sprintKey} missing branches: ${missing.join(", ")}`);
    }
    cleaned[sprintKey] = cleanedTrack as FocusAreaTrack;
  }
  return cleaned;
}

// ── SEED EXTRACTION ────────────────────────────────────────────────────────────

async function extractFocusSeedsLLM(resume: string): Promise<Array<{ label: string; focus_key: string; anchor_context: string }>> {
  const raw = await callGeminiJson(
    `You are reading a candidate's resume to identify interview-worthy focus areas.
Return only real projects, internships, research efforts, or technical work from the resume.
Never return locations, universities, URLs, section headers, scholarships, or generic skill buckets.
Do not invent focus areas not explicitly supported by the resume.`,
    `Resume:
${resume.slice(0, 3000)}

Return a JSON array of 3-5 focus areas worth interviewing on. Each must be a specific project, role, or technical claim.

Return ONLY a JSON array, no commentary:
[
  {
    "label": "short human-readable name (e.g. 'TinyML Audio Pipeline' or 'Filmora AIGC Internship')",
    "focus_key": "snake_case_identifier",
    "anchor_context": "1-2 sentence summary of what they claimed to build or do here"
  }
]

Rules:
- Only include real technical work: projects, internships, research, deployed systems
- Never include: universities, cities, countries, URLs, skill lists, GPA, scholarship names
- focus_key must be lowercase with underscores, max 6 words`,
    "fast"
  );

  let result: unknown[] = [];
  if (Array.isArray(raw)) {
    result = raw;
  } else if (typeof raw === "object" && raw !== null && "focus_areas" in raw) {
    result = (raw as { focus_areas: unknown[] }).focus_areas;
  }

  return result
    .filter((item): item is Record<string, string> => typeof item === "object" && item !== null)
    .map((item) => ({
      label: String(item.label ?? "").trim(),
      focus_key: compactFocusKey(String(item.label ?? ""), String(item.focus_key ?? "")),
      anchor_context: String(item.anchor_context ?? "").trim(),
    }))
    .filter((s) => s.label && s.focus_key)
    .slice(0, 5);
}

// ── FOCUS TRACK GENERATION ─────────────────────────────────────────────────────

async function generateFocusTrack(
  resumeContext: string,
  seed: { label: string; focus_key: string; anchor_context: string; resume_snippets: string[] },
  nextFocusLabel: string
): Promise<Record<string, FocusAreaTrack>> {
  const fb = fallbackTrack(seed, nextFocusLabel);

  const user = `Candidate background:
${resumeContext.slice(0, 2600)}

Current focus area:
- Label: ${seed.label}
- Focus key: ${seed.focus_key}
- Supporting resume details: ${seed.anchor_context.slice(0, 500) || seed.label}
- Exact resume snippets:
${seed.resume_snippets.slice(0, 3).map((s) => `- ${s}`).join("\n") || "- None available"}
- Example next focus for a natural bridge: ${nextFocusLabel || "another area from the candidate's background"}

Return ONLY a JSON object with this exact structure:
{
  "sprint_1": {
    "if_strong": "implementation/depth follow-up if they show real ownership",
    "if_vague": "ownership/mechanism probe if they answer vaguely",
    "if_honest_gap": "honesty-aware question that rewards admission and pivots to what they do know",
    "if_claim_conflict": "specific contradiction probe if answer conflicts with resume claim",
    "if_short_answer": "rescue question for a 1-5 word answer",
    "bridge_to_next_focus": "natural pivot from this focus area toward ${nextFocusLabel}"
  },
  "sprint_2": { "if_strong": "...", "if_vague": "...", "if_honest_gap": "...", "if_claim_conflict": "...", "if_short_answer": "...", "bridge_to_next_focus": "..." },
  "sprint_3": { "if_strong": "...", "if_vague": "...", "if_honest_gap": "...", "if_claim_conflict": "...", "if_short_answer": "...", "bridge_to_next_focus": "..." }
}

Hard rules:
- Every question must reference THIS focus area explicitly
- Every question must stay grounded in the exact resume snippets / anchor context
- sprint_1 = ownership, build choices, contribution; sprint_2 = mechanism, concepts, tradeoffs; sprint_3 = scale, failure, production
- bridge_to_next_focus must name the next focus explicitly
- Keep each question ≤24 words
- No markdown, no commentary, JSON only`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGeminiJson(
        "You are designing an elite interviewer's fallback spine for one specific resume focus area. Generate surgical, interviewer-quality questions grounded in the exact resume context provided. No generic questions. No markdown.",
        user,
        "deep"
      );
      return parseTrackOutput(raw, seed, fb);
    } catch {
      // second attempt or fall through to fallback
    }
  }
  return fb;
}

// ── PUBLIC API ─────────────────────────────────────────────────────────────────

/** Build the full interview trajectory map from a raw resume string. */
export async function generateInterviewMap(resume: string): Promise<InterviewMap> {
  const started = Date.now();

  let seeds = await extractFocusSeedsLLM(resume).catch(() => [] as Array<{ label: string; focus_key: string; anchor_context: string }>);
  if (!seeds.length) seeds = fallbackFocusSeedsFromResume(resume);

  const seen = new Set<string>();
  const enrichedSeeds: Array<{ label: string; focus_key: string; anchor_context: string; resume_snippets: string[] }> = [];
  for (const seed of seeds) {
    const focusKey = compactFocusKey(seed.label, seed.focus_key);
    if (!focusKey || seen.has(focusKey)) continue;
    const snippets = extractResumeSnippets(resume, seed, 3);
    if (!snippets.length) continue;
    enrichedSeeds.push({ ...seed, focus_key: focusKey, resume_snippets: snippets });
    seen.add(focusKey);
  }

  if (!enrichedSeeds.length) {
    console.warn("[InterviewMap] No focus seeds extracted from resume");
    return { focus_areas: [], generated_at: Date.now() };
  }

  const tracks = await Promise.allSettled(
    enrichedSeeds.slice(0, 5).map((seed, index) => {
      const nextLabel = enrichedSeeds[(index + 1) % enrichedSeeds.length]?.label ?? "another area from the candidate's background";
      return generateFocusTrack(resume, seed, nextLabel);
    })
  );

  const focusAreas: FocusArea[] = enrichedSeeds.slice(0, 5).map((seed, i) => {
    const result = tracks[i];
    const track = result?.status === "fulfilled" ? result.value : fallbackTrack(seed, enrichedSeeds[0]?.label ?? "another area");
    return {
      label: seed.label,
      focus_key: seed.focus_key,
      anchor_context: seed.anchor_context,
      resume_snippets: seed.resume_snippets,
      sprint_1: track["sprint_1"]!,
      sprint_2: track["sprint_2"]!,
      sprint_3: track["sprint_3"]!,
    };
  });

  console.log(`[InterviewMap] Built ${focusAreas.length} focus areas in ${Date.now() - started}ms`);
  return { focus_areas: focusAreas, generated_at: Date.now() };
}

/** Get the rich focus context for an area (label, anchor_context, resume_snippets, prompt_context). */
export function getInterviewMapFocusContext(
  map: InterviewMap | null | undefined,
  focusKey: string,
  opts?: { queryText?: string; history?: Array<{ focus_key?: string; answer?: string }>; limit?: number }
): { focus_key: string; focus_label: string; anchor_context: string; resume_snippets: string[]; prompt_context: string } | null {
  if (!map?.focus_areas?.length) return null;

  const matchArea = (key: string) => {
    const norm = normalizeKey(key);
    return map.focus_areas.find((a) => {
      const mapKey = normalizeKey(a.focus_key);
      if (!mapKey || !norm) return false;
      if (mapKey === norm || mapKey.includes(norm) || norm.includes(mapKey)) return true;
      const ignored = new Set(["ai", "engineering", "engineer", "intern", "internship", "at"]);
      const mapTokens = new Set(mapKey.split("_").filter((t) => t && !ignored.has(t)));
      const normTokens = new Set(norm.split("_").filter((t) => t && !ignored.has(t)));
      const overlap = [...mapTokens].filter((t) => normTokens.has(t)).length;
      if (mapTokens.size && normTokens.size) return overlap / Math.min(mapTokens.size, normTokens.size) >= 0.6;
      return false;
    });
  };

  let area = matchArea(focusKey);
  if (!area && opts?.history?.length) {
    const lastFocusKey = [...opts.history].reverse().find((t) => (t.focus_key ?? "") && (t.answer ?? "").split(" ").length >= 8)?.focus_key ?? "";
    if (lastFocusKey) area = matchArea(lastFocusKey);
  }
  if (!area && opts?.queryText) {
    const queryTokens = tokenize(opts.queryText);
    if (queryTokens.size) {
      const scored = map.focus_areas
        .map((a) => {
          const aTokens = tokenize(`${a.label} ${a.anchor_context} ${a.resume_snippets.join(" ")}`);
          return { area: a, score: [...queryTokens].filter((t) => aTokens.has(t)).length };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      area = scored[0]?.area;
    }
  }
  if (!area) return null;

  const limit = opts?.limit ?? 3;
  const snippets = area.resume_snippets.slice(0, limit);
  const lines = [];
  if (area.label) lines.push(`Focus area: ${area.label}`);
  if (area.anchor_context) lines.push(`Resume anchor: ${area.anchor_context}`);
  if (snippets.length) {
    lines.push("Exact resume snippets:");
    lines.push(...snippets.map((s) => `- ${s}`));
  }
  return {
    focus_key: area.focus_key,
    focus_label: area.label,
    anchor_context: area.anchor_context,
    resume_snippets: snippets,
    prompt_context: lines.join("\n"),
  };
}

/** Select the best trajectory-map question for the current state. Returns { question, route_kind, focus_key, focus_label, branch } or null. */
export function selectFromTrajectoryMap(
  map: InterviewMap | null | undefined,
  opts: {
    sprint: number;
    focusKey: string;
    answer: string;
    entities: string[];
    history: Array<{ question?: string; focus_key?: string; answer?: string }>;
    admission?: boolean;
    hasDiscrepancy?: boolean;
    branchHint?: string;
  }
): { question: string; route_kind: string; focus_key: string; focus_label: string; branch: string } | null {
  if (!map?.focus_areas?.length) return null;

  const sprintKey = `sprint_${Math.min(3, Math.max(1, opts.sprint))}` as "sprint_1" | "sprint_2" | "sprint_3";
  const wordCount = opts.answer.split(/\s+/).filter(Boolean).length;
  const isShort = wordCount >= 1 && wordCount <= 18;

  let priority: string[];
  if (opts.branchHint && VALID_BRANCHES.has(opts.branchHint)) {
    priority = [opts.branchHint, ...BRANCH_PRIORITY_DEFAULT.filter((b) => b !== opts.branchHint)];
  } else if (opts.hasDiscrepancy) {
    priority = BRANCH_PRIORITY_DISCREPANCY;
  } else if (opts.admission) {
    priority = BRANCH_PRIORITY_ADMISSION;
  } else if (isShort) {
    priority = BRANCH_PRIORITY_SHORT;
  } else {
    priority = BRANCH_PRIORITY_DEFAULT;
  }

  const normalizeQ = (q: string) =>
    q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const alreadyAsked = (q: string): boolean => {
    const norm = normalizeQ(q);
    return opts.history.slice(-15).some((t) => normalizeQ(t.question ?? "") === norm);
  };

  const matchFocusKey = (key: string): FocusArea | undefined => {
    const norm = normalizeKey(key);
    return map.focus_areas.find((a) => {
      const mk = normalizeKey(a.focus_key);
      if (!mk || !norm) return false;
      if (mk === norm || mk.includes(norm) || norm.includes(mk)) return true;
      const ignored = new Set(["ai", "engineering", "engineer", "intern", "internship", "at"]);
      const mt = new Set(mk.split("_").filter((t) => t && !ignored.has(t)));
      const nt = new Set(norm.split("_").filter((t) => t && !ignored.has(t)));
      const ov = [...mt].filter((t) => nt.has(t)).length;
      if (mt.size && nt.size) return ov / Math.min(mt.size, nt.size) >= 0.6;
      return false;
    });
  };

  const currentMatch = matchFocusKey(opts.focusKey);
  const lastFocusKey = [...opts.history].reverse().find(
    (t) => (t.focus_key ?? "") && (t.answer ?? "").split(/\s+/).length >= 8
  )?.focus_key ?? "";
  const lastMatch = lastFocusKey && lastFocusKey !== opts.focusKey ? matchFocusKey(lastFocusKey) : undefined;

  const queryTokens = tokenize(`${opts.focusKey} ${opts.answer} ${opts.entities.join(" ")}`);
  const remaining = map.focus_areas
    .filter((a) => a !== currentMatch && a !== lastMatch)
    .map((a) => {
      const aTokens = tokenize(`${a.label} ${a.anchor_context} ${a.resume_snippets.join(" ")}`);
      return { area: a, score: [...queryTokens].filter((t) => aTokens.has(t)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.area);

  const searchGroups: Array<{ area: FocusArea; groupIndex: number } | undefined> = [
    ...(currentMatch ? [{ area: currentMatch, groupIndex: 0 }] : []),
    ...(lastMatch ? [{ area: lastMatch, groupIndex: 1 }] : []),
    ...remaining.map((a) => ({ area: a, groupIndex: 2 })),
  ];

  for (const item of searchGroups) {
    if (!item) continue;
    const { area, groupIndex } = item;
    const track = area[sprintKey] as FocusAreaTrack;
    if (!track) continue;

    const branchOrder = groupIndex === 0 && opts.branchHint !== "bridge_to_next_focus"
      ? priority.filter((b) => b !== "bridge_to_next_focus")
      : priority;

    for (const branch of branchOrder) {
      const question = (track[branch as keyof FocusAreaTrack] ?? "").trim();
      if (!question || alreadyAsked(question)) continue;
      return {
        question,
        route_kind: BRANCH_TO_ROUTE[branch] ?? "trajectory_map_followup",
        focus_key: area.focus_key,
        focus_label: area.label,
        branch,
      };
    }

    if (groupIndex === 0) {
      const bridge = (track.bridge_to_next_focus ?? "").trim();
      if (bridge && !alreadyAsked(bridge)) {
        return {
          question: bridge,
          route_kind: "trajectory_map_bridge",
          focus_key: area.focus_key,
          focus_label: area.label,
          branch: "bridge_to_next_focus",
        };
      }
    }
  }

  return null;
}
