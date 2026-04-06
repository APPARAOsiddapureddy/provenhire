import {
  HR_QUESTIONS,
  ROLE_PLANS,
  FALLBACK_PLAN,
  resolveInterviewBankRole,
} from "../../data/aiInterviewStaticQuestions.js";

function normalizePrompt(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?.!,;:]+$/g, "");
}

/** Match `questionText` to a bank row for the role and return deepening follow-ups. */
export function findFollowupsForQuestionText(questionText: string, jobRole: string): string[] {
  const key = resolveInterviewBankRole(jobRole);
  const tech = ROLE_PLANS[key] ?? FALLBACK_PLAN;
  const nt = normalizePrompt(questionText);
  if (!nt) return [];

  for (const q of tech) {
    if (normalizePrompt(q.prompt) === nt) return [...(q.followups ?? [])];
  }
  for (const q of tech) {
    const pn = normalizePrompt(q.prompt);
    if (pn.length >= 24 && (nt.includes(pn.slice(0, 28)) || pn.includes(nt.slice(0, 28)))) {
      return [...(q.followups ?? [])];
    }
  }
  for (const q of HR_QUESTIONS) {
    if (normalizePrompt(q.prompt) === nt) return [...(q.followups ?? [])];
  }
  return [];
}
