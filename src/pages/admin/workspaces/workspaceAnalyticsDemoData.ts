import type { ModuleCategoryStat, RetakeEntry, WorkspaceAnalyticsSnapshot } from "./workspaceAnalyticsTypes";

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

function demoModule(
  rand: () => number,
  avg: number,
  spread: number,
  attempted: number,
  completedFraction: number,
  categories: Array<{ name: string; avg: number; spread: number }>,
): WorkspaceAnalyticsSnapshot["modules"][keyof WorkspaceAnalyticsSnapshot["modules"]] {
  const completedCount = Math.round(attempted * completedFraction);
  const top = Math.round(completedCount * (0.22 + rand() * 0.08));
  const bottom = Math.round(completedCount * (0.14 + rand() * 0.08));
  const mid = Math.max(0, completedCount - top - bottom);
  return {
    configured: true,
    attemptedCount: attempted,
    completedCount,
    avgPercentageScore: clampScore(avg + (rand() - 0.5) * spread),
    bands: { top, mid, bottom },
    categories: categories.map(
      (c): ModuleCategoryStat => ({
        name: c.name,
        avgScore: clampScore(c.avg + (rand() - 0.5) * c.spread),
        sampleSize: Math.round(completedCount * (0.85 + rand() * 0.15)),
      }),
    ),
  };
}

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
    coding: demoModule(rand, 71, 6, totalCandidates, 0.95, [
      { name: "Easy", avg: 89, spread: 5 },
      { name: "Medium", avg: 64, spread: 8 },
      { name: "Hard", avg: 38, spread: 10 },
    ]),
    sql: demoModule(rand, 76, 6, totalCandidates, 0.94, [
      { name: "general / Easy", avg: 92, spread: 5 },
      { name: "analytics / Medium", avg: 74, spread: 8 },
      { name: "operations / Medium", avg: 69, spread: 8 },
      { name: "engineering / Hard", avg: 49, spread: 10 },
    ]),
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

  const roundLabels: Record<keyof typeof modules, string> = {
    mcq: "Aptitude",
    coding: "Coding",
    sql: "SQL",
    interview: "AI Interview",
  };
  const retakeReasons: Array<{ roundType: keyof typeof modules; detail: () => string }> = [
    { roundType: "mcq", detail: () => `${20 + Math.round(rand() * 25)}%` },
    { roundType: "coding", detail: () => `${15 + Math.round(rand() * 25)}%` },
    { roundType: "sql", detail: () => `${10 + Math.round(rand() * 25)}%` },
    { roundType: "interview", detail: () => "Foundation Gap" },
  ];
  const retakeList: RetakeEntry[] = Array.from({ length: 18 }).map((_, index) => {
    const first = DEMO_FIRST_NAMES[Math.floor(rand() * DEMO_FIRST_NAMES.length)];
    const last = DEMO_LAST_NAMES[Math.floor(rand() * DEMO_LAST_NAMES.length)];
    const reason = retakeReasons[Math.floor(rand() * retakeReasons.length)];
    const isIncomplete = rand() < 0.25;
    return {
      userId: `demo-candidate-${index + 1}`,
      name: `${first} ${last}`,
      email: `demo.candidate${String(index + 1).padStart(3, "0")}@demo.provenhire.in`,
      roundType: reason.roundType,
      roundLabel: roundLabels[reason.roundType],
      reason: isIncomplete ? "incomplete" : "below_threshold",
      detail: isIncomplete ? "Not attempted" : reason.detail(),
    };
  });

  return {
    workspace: { ...workspace, totalCandidates },
    generatedAt: new Date().toISOString(),
    readiness: { ready, incomplete, belowThreshold },
    modules,
    retakeList,
  };
}
