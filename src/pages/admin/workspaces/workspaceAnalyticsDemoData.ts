import type {
  ModuleCategoryStat,
  ProficiencyTiers,
  RetakeEntry,
  WorkspaceAnalyticsSnapshot,
  WorkspaceRoundTypeKey,
} from "./workspaceAnalyticsTypes";

// Presentation-only fabricated dataset for demoing the analytics dashboard at
// realistic scale. Never fetched from or written to the database - purely a
// client-side stand-in, swapped in behind an explicit toggle that always
// shows a "Demo data" badge so it can never be mistaken for a real snapshot.

const DEMO_FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna",
  "Ishaan", "Rohan", "Ananya", "Diya", "Saanvi", "Myra", "Aadhya", "Kiara",
  "Riya", "Anika", "Ira", "Navya", "Kabir", "Aryan", "Dhruv", "Yash", "Rudra",
  "Pari", "Zara", "Meera", "Tara", "Ishita",
];
const DEMO_LAST_NAMES = [
  "Sharma", "Verma", "Iyer", "Rao", "Nair", "Gupta", "Reddy", "Menon", "Pillai",
  "Kulkarni", "Bose", "Chatterjee", "Desai", "Joshi", "Kapoor", "Mehta",
  "Patil", "Shah", "Singh", "Trivedi",
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function demoCategoryList(
  rand: () => number,
  completedCount: number,
  entries: Array<{ name: string; avg: number; spread: number }>,
): ModuleCategoryStat[] {
  return entries.map((c): ModuleCategoryStat => {
    const avgScore = clampScore(c.avg + (rand() - 0.5) * c.spread);
    const sampleSize = Math.round(completedCount * (0.85 + rand() * 0.15));
    const weakFraction = Math.max(0, 1 - avgScore / 100) * (0.75 + rand() * 0.4);
    const weakCandidateCount = Math.min(sampleSize, Math.round(sampleSize * weakFraction));
    return { name: c.name, avgScore, sampleSize, weakCandidateCount };
  });
}

// Absolute Good/Average/Poor proficiency split, shaped around avgScore
// rather than a fixed distribution, so a module with a low average actually
// produces a proficiency split dominated by "Poor" and vice versa - mirrors
// the real proficiencyTiers() computation server-side closely enough to be
// a believable stand-in.
function demoProficiency(rand: () => number, avgScore: number, completedCount: number): ProficiencyTiers {
  if (completedCount === 0) return { good: 0, average: 0, poor: 0 };
  const centered = (avgScore - 50) / 50;
  const goodFraction = clamp01(0.22 + centered * 0.45 + (rand() - 0.5) * 0.08);
  const poorFraction = clamp01(0.22 - centered * 0.35 + (rand() - 0.5) * 0.08);
  const averageFraction = Math.max(0.05, 1 - goodFraction - poorFraction);
  const total = goodFraction + averageFraction + poorFraction;
  const good = Math.round((goodFraction / total) * completedCount);
  const poor = Math.round((poorFraction / total) * completedCount);
  const average = Math.max(0, completedCount - good - poor);
  return { good, average, poor };
}

function demoModule(
  rand: () => number,
  avg: number,
  spread: number,
  attempted: number,
  completedFraction: number,
  categories: Array<{ name: string; avg: number; spread: number }>,
  topics?: Array<{ name: string; avg: number; spread: number }>,
): WorkspaceAnalyticsSnapshot["modules"][keyof WorkspaceAnalyticsSnapshot["modules"]] {
  const completedCount = Math.round(attempted * completedFraction);
  const top = Math.round(completedCount * (0.22 + rand() * 0.08));
  const bottom = Math.round(completedCount * (0.14 + rand() * 0.08));
  const mid = Math.max(0, completedCount - top - bottom);
  const avgPercentageScore = clampScore(avg + (rand() - 0.5) * spread);
  return {
    configured: true,
    attemptedCount: attempted,
    completedCount,
    avgPercentageScore,
    bands: { top, mid, bottom },
    proficiency: demoProficiency(rand, avgPercentageScore, completedCount),
    categories: demoCategoryList(rand, completedCount, categories),
    ...(topics ? { topics: demoCategoryList(rand, completedCount, topics) } : {}),
  };
}

const MODULE_TYPES: WorkspaceRoundTypeKey[] = ["mcq", "coding", "sql", "interview"];
const ROUND_LABELS: Record<WorkspaceRoundTypeKey, string> = {
  mcq: "Aptitude",
  coding: "Coding",
  sql: "SQL",
  interview: "AI Interview",
};

export function buildDemoAnalyticsSnapshot(
  workspace: WorkspaceAnalyticsSnapshot["workspace"],
): WorkspaceAnalyticsSnapshot {
  const rand = mulberry32(20260723);
  const totalCandidates = 214;
  const ready = 148;
  const belowThreshold = 44;
  const incomplete = totalCandidates - ready - belowThreshold;

  const modules: WorkspaceAnalyticsSnapshot["modules"] = {
    mcq: demoModule(rand, 68, 6, totalCandidates, 0.97, [
      { name: "Quantitative", avg: 72, spread: 8 },
      { name: "Logical Reasoning", avg: 69, spread: 8 },
      { name: "Verbal Reasoning", avg: 63, spread: 8 },
      { name: "Number System", avg: 66, spread: 8 },
    ]),
    coding: demoModule(
      rand,
      71,
      6,
      totalCandidates,
      0.95,
      [
        { name: "Easy", avg: 89, spread: 5 },
        { name: "Medium", avg: 64, spread: 8 },
        { name: "Hard", avg: 38, spread: 10 },
      ],
      [
        { name: "Arrays & Strings", avg: 88, spread: 5 },
        { name: "Hashing", avg: 79, spread: 6 },
        { name: "Two Pointers / Sliding Window", avg: 71, spread: 7 },
        { name: "Stacks & Queues", avg: 68, spread: 7 },
        { name: "Sorting & Searching", avg: 65, spread: 7 },
        { name: "Linked Lists", avg: 61, spread: 8 },
        { name: "Trees", avg: 54, spread: 9 },
        { name: "Backtracking & Recursion", avg: 47, spread: 9 },
        { name: "Graphs", avg: 36, spread: 10 },
        { name: "Dynamic Programming", avg: 31, spread: 10 },
      ],
    ),
    sql: demoModule(
      rand,
      76,
      6,
      totalCandidates,
      0.94,
      [
        { name: "general / Easy", avg: 92, spread: 5 },
        { name: "analytics / Medium", avg: 74, spread: 8 },
        { name: "operations / Medium", avg: 69, spread: 8 },
        { name: "engineering / Hard", avg: 49, spread: 10 },
      ],
      [
        { name: "Filtering & Sorting", avg: 91, spread: 5 },
        { name: "Joins", avg: 73, spread: 7 },
        { name: "Aggregations & Grouping", avg: 66, spread: 8 },
        { name: "Subqueries", avg: 54, spread: 9 },
        { name: "Schema Design / DDL", avg: 50, spread: 9 },
        { name: "Window Functions", avg: 34, spread: 10 },
      ],
    ),
    interview: demoModule(rand, 70, 6, totalCandidates, 0.91, [
      { name: "communication_clarity", avg: 74, spread: 7 },
      { name: "project_ownership", avg: 72, spread: 7 },
      { name: "hr_professional_readiness", avg: 73, spread: 7 },
      { name: "answer_structure", avg: 70, spread: 7 },
      { name: "role_specific_readiness", avg: 68, spread: 7 },
      { name: "practical_reasoning", avg: 67, spread: 7 },
      { name: "cs_fundamentals", avg: 66, spread: 7 },
      { name: "programming_logic", avg: 64, spread: 7 },
    ]),
  };

  // Below-threshold candidates: most struggle in exactly one round, but a
  // realistic minority are behind in two or three - this is what makes the
  // candidate-segmentation view (single gap / multiple gaps) meaningful
  // instead of every weak candidate being an isolated, unrelated case.
  const retakeList: RetakeEntry[] = [];
  for (let i = 0; i < belowThreshold; i += 1) {
    const first = pick(DEMO_FIRST_NAMES, rand);
    const last = pick(DEMO_LAST_NAMES, rand);
    const userId = `demo-weak-${i + 1}`;
    const name = `${first} ${last}`;
    const email = `demo.candidate${String(i + 1).padStart(3, "0")}@demo.provenhire.in`;
    const gapRoll = rand();
    const gapCount = gapRoll < 0.58 ? 1 : gapRoll < 0.87 ? 2 : 3;
    const gapModules = shuffled(MODULE_TYPES, rand).slice(0, gapCount);
    for (const type of gapModules) {
      retakeList.push({
        userId,
        name,
        email,
        roundType: type,
        roundLabel: ROUND_LABELS[type],
        reason: "below_threshold",
        detail: type === "interview" ? "Foundation Gap" : `${20 + Math.round(rand() * 35)}%`,
      });
    }
  }
  for (let i = 0; i < incomplete; i += 1) {
    const first = pick(DEMO_FIRST_NAMES, rand);
    const last = pick(DEMO_LAST_NAMES, rand);
    const userId = `demo-incomplete-${i + 1}`;
    const name = `${first} ${last}`;
    const email = `demo.candidate${String(belowThreshold + i + 1).padStart(3, "0")}@demo.provenhire.in`;
    const type = pick(MODULE_TYPES, rand);
    retakeList.push({
      userId,
      name,
      email,
      roundType: type,
      roundLabel: ROUND_LABELS[type],
      reason: "incomplete",
      detail: rand() < 0.4 ? "In progress" : "Not attempted",
    });
  }

  return {
    workspace: { ...workspace, totalCandidates },
    generatedAt: new Date().toISOString(),
    readiness: { ready, incomplete, belowThreshold },
    modules,
    retakeList,
  };
}
