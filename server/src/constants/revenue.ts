/** PRD 4 — Revenue model (April 2026). Display + server validation; payments manual until Razorpay. */

export const CANDIDATE_RETAKE_SINGLE_INR = 399;
export const CANDIDATE_RETAKE_BUNDLE_INR = 649;
/** Non-technical role assignment retakes (2nd+ paid attempt) — same ledger row type; messaging differs. */
export const CANDIDATE_NON_TECH_ASSIGNMENT_RETAKE_SINGLE_INR = 299;
export const CANDIDATE_NON_TECH_ASSIGNMENT_RETAKE_BUNDLE_INR = 499;
export const CANDIDATE_RETAKE_CREDIT_VALIDITY_DAYS = 90;

export const RECRUITER_STARTER_INR_MONTH = 2999;
export const RECRUITER_GROWTH_INR_MONTH = 7999;
export const JD_INTERVIEW_EXTRA_INR = 799;
export const HUMAN_EXPERT_INTERVIEW_RECRUITER_INR = 2500;
export const EXPERT_PAYOUT_FOUNDING_INR = 750;
export const EXPERT_PAYOUT_STANDARD_INR = 1500;

/** Expert interview cooldown after any finished attempt (completed / failed / pending_review). */
export const COOLDOWN_AI_EXPERT_MS = 30 * 24 * 60 * 60 * 1000;
export const COOLDOWN_AI_SKILLS_MS = 7 * 24 * 60 * 60 * 1000;
export const COOLDOWN_SYSTEM_DESIGN_MS = 7 * 24 * 60 * 60 * 1000;
export const COOLDOWN_DSA_MS = 48 * 60 * 60 * 1000;
/** Data round (SQL + Python) — same 48h cadence as DSA per PRD. */
export const COOLDOWN_DATA_ROUND_MS = 48 * 60 * 60 * 1000;
export const COOLDOWN_CS_FUNDAMENTALS_MS = 24 * 60 * 60 * 1000;
/** Non-tech assignment: free retake cooldown (first retake). */
export const COOLDOWN_NON_TECH_ASSIGNMENT_FREE_MS = 24 * 60 * 60 * 1000;
/** Non-tech assignment: after a paid retake attempt. */
export const COOLDOWN_NON_TECH_ASSIGNMENT_PAID_MS = 7 * 24 * 60 * 60 * 1000;
