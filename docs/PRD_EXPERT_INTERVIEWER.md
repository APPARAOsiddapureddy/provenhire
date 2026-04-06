# PRD: Expert Interviewer — Product Requirements (v1.0, April 2026)

**Status:** Final specification; **implementation** in repo is partial-to-mostly-complete for backend flows.

**Team index:** [docs/README.md](README.md) · **Main PRD:** [PRD.md](PRD.md) · **Test expert seed:** `server/prisma/seed-interviewer.ts` (e.g. `qa.expert.apr2026@test.provenhire.com`)

## Summary

Expert interviewers conduct Stage 5 human interviews, set availability, view candidate context, submit weighted evaluations (≥70 = pass / L3), and accrue per-session earnings. Full narrative, UI wireframes, and notification copy live in the product PRD; this file tracks **what the codebase implements**.

## Implemented in this repo

| Area | Details |
|------|---------|
| **Schema** | `Interviewer` extensions (`bio`, `languagesSpoken`, `profileCompleted`, `totalInterviews`, `totalPassed`, `recurringSchedule`, `recurringActive`), `InterviewerBankDetails`, `InterviewerEarning`, `HumanInterviewSession.interviewerNotes` / `candidateFeedback`, `JobSeekerProfile.humanExpertRetryAfter`, `InterviewerApplication.currentCompany` / `jobTitle`. Migration: `server/prisma/migrations/20260406120000_expert_interviewer_prd`. |
| **Profile gate** | `GET`/`POST`/`PATCH /api/expert/profile` exempt; other expert routes require `profileCompleted`. Existing DB interviewers backfilled `profileCompleted = true` in migration; **new** invites start with `false` until `POST /api/expert/profile`. |
| **Invite token** | Admin approve: password-set token **72h** (was 7d). |
| **Evaluation** | Seven dimensions + PRD weights (technical vs non-technical), threshold 70, `409` on duplicate submit. Response omits pass/fail; shows `earningsPaise`, `weightedScoreSubmitted`. |
| **Earnings** | `InterviewerEarning` per submission (₹25000 paise). `GET /api/expert/earnings/summary`, `/history`, `/sessions`. |
| **Bank** | `POST /api/expert/bank-details` with AES-256-GCM (`BANK_DETAILS_ENCRYPTION_KEY` in production). |
| **Slots** | `GET/POST /api/expert/slots`, `POST /api/expert/slots/bulk`, recurring `POST/DELETE /api/expert/recurring-schedule`. |
| **Cron** | `POST /api/cron/expert-recurring-slots` (with `CRON_SECRET`) → `generateRecurringSlotsForAllInterviewers`. |
| **Cooldown** | Failed expert eval sets `humanExpertRetryAfter` (+30d). `getHumanInterviewEligibility` + `/api/verification/book-slot` respect cooldown. |
| **Careers form** | `/careers/interviewer` — company, title, 5+ years, 100+ char why, required phone/LinkedIn. |
| **UI** | `/dashboard/expert/profile-setup`, dashboard redirect if incomplete, interview room 7 dimensions + feedback fields, admin table columns for company/title. |

## Operational notes

- Schedule cron: `expire-skills` (existing) + **`expert-recurring-slots`** daily if using recurring availability.
- **`BANK_DETAILS_ENCRYPTION_KEY`**: 32-byte value as hex (64 chars) or base64; required in production for bank POST.

## Out of scope (per PRD)

In-app video (Meet link only), Razorpay **payout** to interviewers, full dossier page, earnings payout calendar automation, candidate-facing interviewer stats card polish.

---

*For the full PRD (screens, copy, acceptance criteria), use the canonical product document. This file is the engineering index.*
