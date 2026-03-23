/**
 * PRD §6 — AI interview session risk from ProctoringEvent rows (sessionId = interviewId, testType = ai_interview).
 */

export type ProctoringEventRow = { type: string };

function tabSwitchPoints(count: number): number {
  let pts = 0;
  for (let i = 0; i < count; i++) {
    if (i === 0) pts += 5;
    else if (i === 1) pts += 10;
    else pts += 20;
  }
  return pts;
}

function fullscreenExitPoints(count: number): number {
  let pts = 0;
  for (let i = 0; i < count; i++) {
    if (i === 0) pts += 5;
    else pts += 15;
  }
  return pts;
}

/** Map DB / client event types to PRD-style risk accumulation. */
export function computeAiInterviewProctoringRisk(events: ProctoringEventRow[]): number {
  const tabSwitches = events.filter((e) => e.type === "TAB_SWITCH").length;
  const fullscreenExits = events.filter((e) => e.type === "FULLSCREEN_EXIT").length;
  const copyPastes = events.filter((e) => e.type === "COPY_PASTE_ATTEMPT").length;
  const devtools = events.filter((e) => e.type === "DEVTOOLS_OPENED").length;
  const noFace = events.filter((e) => e.type === "NO_FACE_DETECTED" || e.type === "FACE_MISSING").length;
  const multiFace = events.filter(
    (e) => e.type === "MULTIPLE_FACES_DETECTED" || e.type === "MULTIPLE_PERSONS",
  ).length;

  let score = 0;
  score += tabSwitchPoints(tabSwitches);
  score += fullscreenExitPoints(fullscreenExits);
  if (copyPastes >= 3) score += 40;
  else if (copyPastes >= 1) score += 15;
  if (devtools > 0) score += 30;
  if (noFace > 0) {
    score += noFace === 1 ? 10 : 20;
  }
  if (multiFace > 0) score += 25;

  return Math.min(100, Math.max(0, score));
}

export function integrityFlagFromRiskScore(riskScore: number): string | null {
  if (riskScore <= 20) return null;
  if (riskScore <= 40) return "review_recommended";
  if (riskScore <= 60) return "review_required";
  return "integrity_violation";
}
