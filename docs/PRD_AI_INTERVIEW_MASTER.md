# PRD: AI Expert Interview (Master — Single Source)

**Product:** ProvenHire · **Stage:** Verification **Stage 4** (`expert_interview`)  
**Version:** 1.2 (STT + integrity accuracy, admin gate) · **April 2026**  
**Detail spec:** [`PRD_AI_INTERVIEW_ROUND.md`](PRD_AI_INTERVIEW_ROUND.md) (v3.0) · **Scoring:** [`PRD_VERIFICATION_SCORING.md`](PRD_VERIFICATION_SCORING.md)

This document is the **efficient, end-to-end** description of what the AI interview is, which AI and third parties are used, and how it fits the pipeline. For legal/board depth, use the long PRD; for engineering tickets, use **§16** in the long PRD plus this file.

**§12** below records **what shipped** in the repository as of the **Professional Upgrade** (orchestrator, agents, TTS fillers, schema). Align `PRD_AI_INTERVIEW_ROUND.md` §16 when doing a full spec audit.

---

## 1. Purpose

- **Candidate:** Structured technical dialogue (voice-first) that measures depth, reasoning, and communication—not static Q&A only.
- **Employer signal:** A **0–100** AI interview score and badge (Elite / Gold / Silver / Not Verified) feeding the **Skill Passport** and recruiter views.
- **Philosophy:** **Adversarial v2** probes failure boundaries via dynamic follow-ups (weakness, discrepancy, reasoning probes), not flash-card correctness.

---

## 2. Verification placement & gating

| Stage | Name | Notes |
|-------|------|--------|
| 1–3 | Profile, Aptitude, DSA | Prerequisites |
| **4** | **AI Expert Interview** | This PRD |
| 5 | Human expert interview | Separate PRD; unlocked by scorecard |

**Technical scorecard blend:** `aptitude × 0.25 + DSA × 0.35 + AI_interview × 0.40` (each arm 0–100).  
**Typical unlock to Stage 5:** combined rules + floors (e.g. aptitude ≥ 55, DSA ≥ 60, **AI interview ≥ 60**)—see `buildTechnicalScorecard()` and `PRD_VERIFICATION_SCORING.md`.

**After AI interview (v2):** Completing the session sets `Interview.status` to **`completed`**, runs **`evaluateFullInterview`**, then **`recordAiInterviewSubmittedForAdminReview`** — verification stage **`expert_interview`** is **`pending_review`** until an admin **`POST /api/admin/ai-interview-queue/:id/approve`** (unlocks **`human_expert_interview`**, may waive first paid attempt) or **`.../reject`** (**`failed`**). Learners see this in **`VerificationFlow`**; scoring is visible, but Stage 5 is blocked until approval.

---

## 3. AI & ML stack (what we actually use)

| Layer | Technology | Role |
|-------|------------|------|
| **LLM (SDK)** | Google **Gemini** via `@google/genai` | All interview intelligence |
| **Fast agent calls** | **`gemini-2.0-flash`** | Concept extraction, prefetch question suggestions, cheap JSON |
| **Balanced agents** | **`gemini-2.5-flash`** | Weakness, discrepancy, reasoning-behavior, sprint questions, rubric follow-ups |
| **Final interview evaluation (v2)** | **`gemini-2.5-pro`** | Full-session JSON eval in `evaluateFullInterview()` — **deep** tier |
| **Legacy / v1 path** | **`gemini-2.5-flash`** | `evaluateInterview()` in `ai.service.ts` (transcript + optional per-question rubric) |
| **Other product AI** | Same `GEMINI_API_KEY` | Resume parsing, assignments, etc. (`ai.service.ts`) |

**Required for production AI features:** `GEMINI_API_KEY` on the API host.

**Code anchors:** `server/src/services/interview/agents.ts` (tiers + agents + `evaluateFullInterview`), `server/src/services/interview/orchestrator.ts` (v2 flow), `server/src/services/ai.service.ts` (`evaluateInterview`, `conductInterviewPrompt`).

---

## 4. Adversarial interview engine (v2) — product shape

- **Sprints:** 3 × **Project Defense → Foundations → System Design** (personas: curious lead, socratic mentor, senior peer).
- **Capacity:** Up to **15** Q&A exchanges (5 per sprint), then finalize.
- **Per-turn pipeline (parallel):** Weakness agent, concept agent, discrepancy (resume vs answer), reasoning-behavior agent → **`applyReasoningHonestyCap`** (flexible + calibrated reasoning softens interrogation tone).
- **Follow-up priority (v2):** (1) **High-severity discrepancy** with new `resumeClaim` (not already in `probedClaims`) unless **forced sprint**; (2) **High-severity weakness** unless forced sprint; (3) **Question-bank follow-up deepen** (`adaptFollowup`) when weakness is not high and templates remain; (4) **Prefetch** only if **`isStillRelevant`** to committed answer + concepts; (5) **Sprint question** via `generateSprintQuestion` — load **`findFollowupsForQuestionText`** for the new line. **Same weakness type + high severity twice in a row** → **forced sprint** (`pivoting: true`) to avoid interrogation loops.
- **Transcript fragments:** Answers under **20 characters**, or **20–49 characters** without sentence-ending punctuation, get a clarification prompt **without** running agents or advancing counts (`fragmentRetry` in API).
- **State:** Stored in `Interview.questionPlan` JSON (`sprint`, `history`, `weaknesses`, `reasoningSignals`, `probedClaims`, `currentQuestionFollowups`, `consecutiveHighWeaknessCount`, `turnLog`, etc.).
- **Legacy v1:** Fixed question plans from static arrays or DB (`QUESTION_BANK_SOURCE=static|db`), `POST /api/interview/start` + `respond`; still in codebase for compatibility.

---

## 5. Voice & media stack

| Capability | Target / spec | Repo status (April 2026) |
|------------|---------------|---------------------------|
| **STT (verification ExpertInterviewStage)** | Accurate, segmented capture without coupling to live partials | **Primary:** **`useWhisperSession`** — browser records audio in segments with pause detection, **`POST /api/interview/transcribe`** (**OpenAI Whisper**, `whisper.service.ts`). UI guides “pause ~1.5s” to finalize segments; client debounces TTS tail so model audio is not transcribed as the user. |
| **STT (alternate hook, not wired to Expert stage UI)** | Live streaming + prefetch | **`useDeepgramSession.ts`** + **`GET /api/interview/deepgram-token`** (**nova-3** JWT) + **`/v2/partial`** for prefetch — **not imported** by `ExpertInterviewStage.tsx` today; reserved for future live room UX or other surfaces. |
| **TTS** | **Cartesia** primary → **ElevenLabs** → browser `speechSynthesis` | **`tts.service.ts`**: Cartesia first, then ElevenLabs; **`200` + `{ fallback: true, text }`** for browser TTS. |
| **Filler phrases** | Instant masking before main TTS | **`warmInterviewFillerCache()`** on server startup pre-synthesizes MP3s; **`GET /api/interview/tts-filler`** returns **cached buffer** when available, else live TTS. |

**Optional env:** `OPENAI_API_KEY` (**required** for segmented STT in prod), `DEEPGRAM_API_KEY` (alternate live path only), `ELEVENLABS_*`, `CARTESIA_*` (see `server/.env.example`).

---

## 6. APIs (interview)

**v2 (primary for new sessions):**

- `POST /api/interview/v2/start` — `{ jobRole, experienceLevel? }` → first question + sprint metadata.
- `POST /api/interview/v2/turn` — body may include **`turnId`** (client UUID); response echoes **`turnId`** for stale-response discard. Optional telemetry: **`inputMode`** (`voice` \| `typed`), **`pasteCount`**, **`timeToSubmitSeconds`**, **`audioUrl`**, **`transcriptionConfidence`** (for future anti-gaming / analytics). Response may include **`pivoting`** (forced sprint breadth) or **`fragmentRetry`** (clarification turn).
- `POST /api/interview/v2/partial` — STT partials for prefetch only.
- `GET /api/interview/deepgram-token` — browser STT credential.
- `POST /api/interview/tts` — AI voice line (ElevenLabs or fallback flag).
- `GET /api/interview/tts-filler` — filler line.
- `POST /api/interview/transcribe` — **Whisper** transcription of user audio (multipart); used by expert stage segmented capture.

**Admin (human gate):** `GET /api/admin/ai-interview-queue/pending`, `POST /api/admin/ai-interview-queue/:id/approve`, `POST .../reject` — see `humanInterviewGate.service.ts`.

**v1 (legacy):** `POST /api/interview/start`, `POST /api/interview/respond`, result endpoints—as documented in `PRD_AI_INTERVIEW_ROUND.md` Appendix A.

**Frontend:** `src/pages/verification/stages/ExpertInterviewStage.tsx` (**`useWhisperSession`**, **`useProctoringRiskMonitor`**), `VerificationFlow.tsx` (pending review UX). **`useDeepgramSession.ts`** exists but is **not** mounted on the expert stage today.

---

## 7. Evaluation output & badges

- **v2:** `evaluateFullInterview(..., meta)` receives **`coverageRatio`** (unique weakness types ÷ question turns), **`experienceLevel`**, **`jobRole`**. Gemini **`gemini-2.5-pro`** prompt asks for:
  - **`claim_credibility_risk`** / **`claim_credibility_detail`** (resume substantiation),
  - **`engineering_signal`** / **`engineering_signal_detail`** (ability separate from claim disputes),
  - **`confidence_calibrated`** (low coverage → conservative wording).
- **Persisted on `Interview`:** `totalScore`, `badgeLevel`, `finalVerdict`, `scoreBreakdown` (full JSON), plus **`coverageRatio`**, **`claimCredibilityRisk`**, **`engineeringSignal`**.
- **Thresholds (global):** Elite ≥ 90, Gold ≥ 75, Silver ≥ 60, else Not Verified. Overall score clamped **0–100** in orchestrator.
- **Failure handling:** If **`evaluateFullInterview`** returns null/empty (v2), orchestrator applies a **canonical low neutral JSON** (score ~50, split-report fields defaulted) before persisting. v1 `evaluateInterview` failures follow long PRD §3 (`pending_review` where applicable).
- **Authenticity:** Prompt-level `authenticity_concern` + **anti-gaming** (`aiInterviewAntiGaming.service.ts`), including **formulaic opener** heuristic (“Great question…”, “Certainly…”, “Of course…”).

---

## 8. Integrity: proctoring & anti-gaming

- **Client capture (v2):** **`ExpertInterviewStage`** uses **`useProctoringRiskMonitor`** (tab/visibility + optional lightweight vision on **`proctorVideoRef`**); events POST to **`/api/proctoring/alerts`** with **`testType: "ai_interview"`** and **`sessionId`** = interview id.
- **v1 completion (`POST /respond`):** Proctoring aggregates + **anti-gaming** points are merged into **`Interview.integrityFlag`** and related fields via `integrityFlagFromViolationAggregate`, `integrityFlagFromAntiGamingPoints`, `mergeIntegrityFlags` in **`interview.ts`** — see `aiInterviewProctoringRisk.service.ts`, `aiInterviewAntiGaming.service.ts`.
- **v2 completion (`orchestrator.ts`):** Final **`prisma.interview.update`** sets scores, **`scoreBreakdown`**, split-report columns, and **`status: completed`** but **does not** currently merge proctoring / v2 turn telemetry into **`integrityFlag` / `riskScore`** the way v1 does. Events may still exist in **`ProctoringEvent`** for admin review; **product/engineering:** align v2 finalize with v1 integrity merge or document intentional deferral.
- **Anti-gaming (model + heuristics):** **`authenticity_concern`** in eval JSON; **`formulaic_opener`** and related signals in **`aiInterviewAntiGaming.service.ts`** (strongest wiring on v1 respond path today).

---

## 9. Data & configuration

- **Question bank:** `InterviewQuestionBank` includes **`followups`** JSON (`string[]`) for deepening probes. Static **`ROLE_PLANS`** / **`HR_QUESTIONS`** carry optional **`followups`**; **`questionBankService.ts`** resolves follow-ups by prompt match for v2. **`QUESTION_BANK_SOURCE`**: static (default) or **db**; DB **`buildQuestionPlan`** selects `followups` column; seed **`interviewQuestionBank.seed.ts`** writes follow-ups from static rows. Admin **POST/PATCH `/api/admin/questions`** accepts **`followups`**.
- **Per-question results:** `InterviewQuestionResult` (v1 / admin analytics path; verify v2 finalize alignment in long PRD §16).
- **Admin:** Pending review queue, re-evaluate, question CRUD—see main `PRD.md` §3.4 and long PRD.

---

## 10. Operator checklist (minimal)

1. Set **`GEMINI_API_KEY`** (required for AI interview intelligence).
2. Set **`OPENAI_API_KEY`** (required for **segmented STT** on the expert interview stage via Whisper).
3. Set **`CARTESIA_API_KEY`** + **`CARTESIA_VOICE_ID`** for primary TTS and **filler pre-cache** at startup (recommended).
4. Set **`ELEVENLABS_*`** as TTS fallback if Cartesia fails.
5. **`DEEPGRAM_API_KEY`** — optional; only needed if product wires **`useDeepgramSession`** for live STT.
6. Confirm **`QUESTION_BANK_SOURCE`** and run **`npm run seed:interview-bank`** if using DB bank.

**Migration (schema):** apply `server/prisma/migrations/20260407120000_ai_interview_followups_split_report/` (Interview bank `followups`, Interview split-report columns).

---

## 11. Known gaps (high level)

Remaining vs **`PRD_AI_INTERVIEW_ROUND.md` §16** and product wishlist:

- **v2 vs v1 integrity:** Merge **proctoring aggregate + anti-gaming** into **`Interview.integrityFlag` / `riskScore`** on **v2** completion (parity with **`POST /respond`**), or explicitly treat v2 as “eval-only” and surface risk from raw events only.
- **Silence nudge** after ~5s; richer **ExpertInterviewStage** UX (review countdown, confidence bands on Whisper).
- **Deepgram live path** unused in expert stage; **Cartesia** missing → fillers skip pre-cache (live fallback).
- **30-minute** cap: **`isInterviewComplete()`** in `orchestrator.ts`.
- **Turn-ID** stale handling: server echo + client discard in **`ExpertInterviewStage`**.

---

## 12. Implementation changelog — Professional Upgrade (shipped in repo)

| Area | Change |
|------|--------|
| **Schema** | `InterviewQuestionBank.followups`; `Interview.coverageRatio`, `claimCredibilityRisk`, `engineeringSignal`. Migration folder `20260407120000_ai_interview_followups_split_report`. |
| **Agents** | Honest-admission regex + **`calibration_success`** / **`explore_depth`**; discrepancy returns **`resumeClaim`**, **`actualStatement`**; **`ReasoningBehaviorOutput`** + **`applyReasoningHonestyCap`**; **`adaptFollowup`**; **`evaluateFullInterview`** extended with coverage + split-report JSON + experience rubric block. |
| **Services** | **`evaluationService.ts`**: `computeWeaknessCoverageRatio`; **`questionBankService.ts`**: `findFollowupsForQuestionText`. |
| **Orchestrator** | Fragment guard; consecutive same-type **high** weakness guard → **forced sprint** + **`pivoting`**; full priority chain + **`probedClaims`**; **`turnLog`**; sprint advance resets streak + loads opener follow-ups; completion persists split-report fields. |
| **TTS** | **`warmInterviewFillerCache()`** in **`server.ts`**; **`getPreCachedFillerMp3`** in tts-filler route. |
| **Routes** | **`v2/turn`**: optional **`turnId`** + telemetry fields; **`interview.ts`** DB plan includes **`followups`**; **`transcribe`** for Whisper STT. |
| **Human gate** | **`recordAiInterviewSubmittedForAdminReview`**: queue email + **`expert_interview`** **`pending_review`** until admin approve/reject. |
| **Admin** | Question create/patch: **`followups`**. |
| **Static data** | Backend **`ROLE_PLANS`** entries include **2 follow-ups** each; sample HR follow-ups. |
| **Anti-gaming** | **`formulaic_opener`** signal. |
| **Frontend** | **`ExpertInterviewStage`**: **`useWhisperSession`** STT, client **`turnId`**, stale-response skip, **`pivoting`** banner, **`useProctoringRiskMonitor`**. |

---

## 13. Document map

| Need | Read |
|------|------|
| This overview + **what shipped** (§12) | **This file** |
| Full product + checklist + voice + §16 code status | `PRD_AI_INTERVIEW_ROUND.md` |
| Scorecard math & stage floors | `PRD_VERIFICATION_SCORING.md` |
| Whole product context | `PRD.md` §3.4 |

*Consolidated for stakeholders who want one efficient doc; the long PRD remains authoritative for edge cases and audit.*
