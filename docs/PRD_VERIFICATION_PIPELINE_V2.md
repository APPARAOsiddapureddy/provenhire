# PRD — Verification Pipeline Redesign (v2.0)

**Status:** Partially implemented in codebase (April 2026).

- **Locked product decisions** and full stage definitions live in the stakeholder PRD you maintain; this file tracks **engineering wiring** only.

## Shipped in repo

| Area | Notes |
|------|--------|
| Schema | `Interview.interviewType`, `dsaContextLoaded`, `lldScore`, `hldScore`; `CandidateSkillVerification.confidenceScore`, `verifiedInStage` |
| Track tiers | `experienceTierFromYears` — fresher `<1y`, mid `1–<3y`, senior `≥3y` |
| DSA | Counts, timers, pass thresholds (50 / 55 / 60) + difficulty slots per PRD §7; `pickDsaOfficialSet` uses ordered slots |
| Pipeline | `VERIFICATION_PIPELINE_V2` — fresher vs mid/senior stage lists in `server/src/constants/verificationPipeline.ts` |
| API | `GET /api/verification/stages` returns `verification_pipeline_v2`, `verification_track`, `stage_order` |
| Certification | `computeProvenhireCertification` v2: L1 = DSA; L2 = AI Skills (fresher) or AI Skills + System Design (mid/senior); L3 = completed `ai_expert` interview |
| UI | `cs_fundamentals` reuses aptitude flow; AI Skills + System Design use `PipelineStagePlaceholder` until full product ships |

## TypeScript type

`DSAContext` — `server/src/types/dsaContext.ts` (for AI Skills context injection).

## Not fully shipped

- Paid retakes, cooldown tables, skill validity windows (§8–9) as automated enforcement
- Full AI Skills + System Design sessions, JD interview (`jd_interview`), DSA context injection into prompts
- Email / in-app 90-day profile refresh
