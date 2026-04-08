# PRD: AI Expert Interview (Master — Single Source)

**Product:** ProvenHire · **Stage:** Verification **Stage 4** (`expert_interview`)  
**Version:** 1.3 (multi-pass eval, v2 integrity parity, timing, admin analytics & replay) · **April 2026**  
**Detail spec:** [`PRD_AI_INTERVIEW_ROUND.md`](PRD_AI_INTERVIEW_ROUND.md) (v3.0.3) · **Scoring:** [`PRD_VERIFICATION_SCORING.md`](PRD_VERIFICATION_SCORING.md)

This document is the **efficient, end-to-end** description of what the AI interview is, which AI and third parties are used, and how it fits the pipeline. For legal/board depth, use the long PRD; for engineering tickets, use **§16** in the long PRD plus this file.

**§12** below records **what shipped** in the repository as of the **Professional Upgrade** plus the **Antigravity-parity tranche** (integrity on v2, multi-pass scoring, turn instrumentation, UX/admin tooling). **`PRD_AI_INTERVIEW_ROUND.md` §16** is kept in sync for engineering status.

---

## 1. Purpose

- **Candidate:** Structured technical dialogue (voice-first) that measures depth, reasoning, and communication—not static Q&A only.
- **Employer signal:** A **0–100** AI interview score and badge (Elite / Gold / Silver / Not Verified) feeding the **Skill Passport** and recruiter views.
- **Philosophy:** **Adversarial v2** probes failure boundaries via dynamic follow-ups (weakness, discrepancy, reasoning probes), not flash-card correctness.

---

## 2. Verification placement & gating

| Stage | Name | Notes |
|-------|------|--------|
| 1–3 | Profile, Aptitude/CS fundamentals, DSA | Prerequisites (exact `stageName` depends on `VERIFICATION_PIPELINE_V2`; see `PRD_VERIFICATION_PIPELINE_V2.md`) |
| **Late pipeline** | **AI Expert Interview** | Verification stage `expert_interview`; interview type **`ai_expert`**. *Legacy copy* calls this “Stage 4”; in **pipeline v2** it follows **AI Skills** (all tiers) and **System Design** (mid/senior). |
| Human step | Human expert interview | Separate PRD; `human_expert_interview` where enabled |

**Retakes / cooldowns** for `expert_interview` sessions: **`docs/PRD_REVENUE_AND_BUSINESS_RULES.md`** + `gateExpertInterviewStart` in `interview.ts`.

**Technical scorecard blend:** `aptitude × 0.25 + DSA × 0.35 + AI_interview × 0.40` (each arm 0–100).  
**Typical unlock to Stage 5:** combined rules + floors (e.g. aptitude ≥ 55, DSA ≥ 60, **AI interview ≥ 60**)—see `buildTechnicalScorecard()` and `PRD_VERIFICATION_SCORING.md`.

**After AI interview (v2):** Completing the session sets `Interview.status` to **`completed`**, runs **`evaluateFullInterviewMultiPass`** (three parallel **`evaluateFullInterview`** calls, merged scores and strictest claim-credibility risk), persists **`evaluationPassCount`** and **`evaluationScoreVariance`**, then **`recordAiInterviewSubmittedForAdminReview`** — verification stage **`expert_interview`** is **`pending_review`** until an admin **`POST /api/admin/ai-interview-queue/:id/approve`** (unlocks **`human_expert_interview`**, may waive first paid attempt) or **`.../reject`** (**`failed`**). Learners see this in **`VerificationFlow`**; scoring is visible, but Stage 5 is blocked until approval.

---

## 3. AI & ML stack (what we actually use)

| Layer | Technology | Role |
|-------|------------|------|
| **LLM (SDK)** | Google **Gemini** via `@google/genai` | All interview intelligence |
| **Fast agent calls** | **`gemini-2.0-flash`** | Concept extraction, prefetch question suggestions, cheap JSON |
| **Balanced agents** | **`gemini-2.5-flash`** | Weakness, discrepancy, reasoning-behavior, sprint questions, rubric follow-ups |
| **Final interview evaluation (v2)** | **`gemini-2.5-pro`** | Full-session JSON eval in `evaluateFullInterview()` — **deep** tier; completion path calls it **three times in parallel** and merges numerics in **`evaluateFullInterviewMultiPass()`** (`evaluationService.ts`) |
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
- `POST /api/interview/v2/turn` — body may include **`turnId`** (client UUID); response echoes **`turnId`** for stale-response discard. Optional telemetry: **`inputMode`** (`voice` \| `typed`), **`pasteCount`**, **`timeToSubmitSeconds`**, **`whisperLatencyMs`** (segment STT latency for **`turnLog`**), **`audioUrl`**, **`transcriptionConfidence`**. Fire-and-forget **`handlePartialTranscript`** on the **full** answer (same prefetch warmup as partials). Response may include **`pivoting`**, **`fragmentRetry`**, **`timeExpired`** (when the 30-minute cap triggers completion), and **`acknowledgement`** (split from main **`response`** for sequential TTS).
- `POST /api/interview/v2/partial` — STT partials for prefetch only.
- `POST /api/interview/:id/request-review` — candidate dispute / second look (**auth**, **job-seeker**): **`reason`** 10–500 chars; within **7 days** of completion; **409** if already requested; sets **`reviewRequestedAt`**, **`reviewRequestReason`**, **`reviewFlag`**, **`reviewReason: candidate_dispute`**.
- `GET /api/interview/deepgram-token` — browser STT credential.
- `POST /api/interview/tts` — AI voice line (ElevenLabs or fallback flag).
- `GET /api/interview/tts-filler` — filler line.
- `POST /api/interview/transcribe` — **Whisper** transcription of user audio (multipart); used by expert stage segmented capture.

**Admin (human gate):** `GET /api/admin/ai-interview-queue/pending`, `POST /api/admin/ai-interview-queue/:id/approve`, `POST .../reject` — see `humanInterviewGate.service.ts`.

**Admin (interview analytics & replay):** `GET /api/admin/questions/analytics` — grouped **`InterviewQuestionResult`** stats joined to **`InterviewQuestionBank`**, **`discriminationFlag`** (`too_hard` / `too_easy` / `good`). `GET /api/admin/interviews/:id/replay` — interview summary, **`messages`**, **`questionResults`**, **`turnLog`** from `questionPlan[0]`, **`ProctoringEvent`** rows (register **`/interviews/pending-review`** before **`:id`** routes). UI: **`AIInterviewReview`** (replay dialog + analytics table) and **`InterviewReplayView.tsx`**.

**v1 (legacy):** `POST /api/interview/start`, `POST /api/interview/respond`, result endpoints—as documented in `PRD_AI_INTERVIEW_ROUND.md` Appendix A.

**Frontend:** `src/pages/verification/stages/ExpertInterviewStage.tsx` — **`useWhisperSession`** (passes **`whisperLatencyMs`** into **`onFinal`** for **`/v2/turn`**), **`useProctoringRiskMonitor`**, client **`turnId`** with **stale discard on response and again after acknowledgement TTS / gap / before main question TTS**, **~5s silence nudge** while listening, **`timeExpired`** banner, **request-review** UI after completion. **`useDeepgramSession.ts`** exists but is **not** mounted on the expert stage today.

**Candidate result metadata:** `GET /api/interview/:id/result` includes **`completedAt`**, **`reviewRequestedAt`** (for gating the review CTA).

---

## 7. Evaluation output & badges

- **v2:** `evaluateFullInterview(..., meta)` receives **`coverageRatio`** (unique weakness types ÷ question turns), **`experienceLevel`**, **`jobRole`**. Gemini **`gemini-2.5-pro`** prompt asks for:
  - **`claim_credibility_risk`** / **`claim_credibility_detail`** (resume substantiation),
  - **`engineering_signal`** / **`engineering_signal_detail`** (ability separate from claim disputes),
  - **`confidence_calibrated`** (low coverage → conservative wording).
- **Persisted on `Interview`:** `totalScore`, `badgeLevel`, `finalVerdict`, `scoreBreakdown` (full JSON), plus **`coverageRatio`**, **`claimCredibilityRisk`**, **`engineeringSignal`**, **`integrityFlag`**, **`riskScore`** (proctoring aggregate on v2 completion), **`evaluationPassCount`**, **`evaluationScoreVariance`** (JSON array of raw pass scores).
- **Per-question (v2):** On completion, **`InterviewQuestionResult`** rows are created from **`per_question_scores`** in the merged evaluation (aligned to user messages by index).
- **Thresholds (global):** Elite ≥ 90, Gold ≥ 75, Silver ≥ 60, else Not Verified. Overall score clamped **0–100** in orchestrator.
- **Failure handling:** If **`evaluateFullInterview`** returns null/empty (v2), orchestrator applies a **canonical low neutral JSON** (score ~50, split-report fields defaulted) before persisting. v1 `evaluateInterview` failures follow long PRD §3 (`pending_review` where applicable).
- **Authenticity:** Prompt-level `authenticity_concern` + **anti-gaming** (`aiInterviewAntiGaming.service.ts`), including **formulaic opener** heuristic (“Great question…”, “Certainly…”, “Of course…”).

---

## 8. Integrity: proctoring & anti-gaming

- **Client capture (v2):** **`ExpertInterviewStage`** uses **`useProctoringRiskMonitor`** (tab/visibility + optional lightweight vision on **`proctorVideoRef`**); events POST to **`/api/proctoring/alerts`** with **`testType: "ai_interview"`** and **`sessionId`** = interview id.
- **v1 completion (`POST /respond`):** Proctoring aggregates + **anti-gaming** points are merged into **`Interview.integrityFlag`** and **`riskScore`** (and related fields) via `integrityFlagFromViolationAggregate`, `integrityFlagFromAntiGamingPoints`, `mergeIntegrityFlags` in **`interview.ts`** — see `aiInterviewProctoringRisk.service.ts`, `aiInterviewAntiGaming.service.ts`.
- **v2 completion (`orchestrator.ts`):** Before final **`prisma.interview.update`**, the same merge pattern runs: **`ProctoringEvent`** rows for the interview → proctoring flag; **anti-gaming** from stored user messages + **`authenticity_concern`**; **`mergeIntegrityFlags`**; **`riskScore`** from proctoring violation total. **`turnLog`** rows include telemetry used for traceability (paste, time-to-submit, answer snapshot).
- **Anti-gaming (model + heuristics):** **`authenticity_concern`** in eval JSON; **`formulaic_opener`** and related signals in **`aiInterviewAntiGaming.service.ts`**; v2 path updates message flags where patches apply and feeds integrity merge.

---

## 9. Data & configuration

- **Question bank:** `InterviewQuestionBank` includes **`followups`** JSON (`string[]`) for deepening probes. Static **`ROLE_PLANS`** / **`HR_QUESTIONS`** carry optional **`followups`**; **`questionBankService.ts`** resolves follow-ups by prompt match for v2. **`QUESTION_BANK_SOURCE`**: static (default) or **db**; DB **`buildQuestionPlan`** selects `followups` column; seed **`interviewQuestionBank.seed.ts`** writes follow-ups from static rows. Admin **POST/PATCH `/api/admin/questions`** accepts **`followups`**.
- **Per-question results:** `InterviewQuestionResult` — written on **v1** and **v2** completion (when evaluation returns **`per_question_scores`**).
- **Admin:** Pending review queue, re-evaluate, question CRUD, **question analytics**, **session replay** — see main `PRD.md` §3.4 and long PRD.
- **Multi-pass metadata (schema):** `Interview.evaluationPassCount`, `Interview.evaluationScoreVariance` — migration **`20260407180000_ai_interview_multipass_metadata`**.

---

## 10. Operator checklist (minimal)

1. Set **`GEMINI_API_KEY`** (required for AI interview intelligence).
2. Set **`OPENAI_API_KEY`** (required for **segmented STT** on the expert interview stage via Whisper).
3. Set **`CARTESIA_API_KEY`** + **`CARTESIA_VOICE_ID`** for primary TTS and **filler pre-cache** at startup (recommended).
4. Set **`ELEVENLABS_*`** as TTS fallback if Cartesia fails.
5. **`DEEPGRAM_API_KEY`** — optional; only needed if product wires **`useDeepgramSession`** for live STT.
6. Confirm **`QUESTION_BANK_SOURCE`** and run **`npm run seed:interview-bank`** if using DB bank.

**Migration (schema):** apply `server/prisma/migrations/20260407120000_ai_interview_followups_split_report/` (Interview bank `followups`, Interview split-report columns) and **`20260407180000_ai_interview_multipass_metadata`** (`evaluationPassCount`, `evaluationScoreVariance`).

---

## 11. Known gaps (high level)

Remaining vs product wishlist (not blockers for current production path):

- **Deepgram live path** still unused in **`ExpertInterviewStage`** (Whisper segmented remains default for verification accuracy).
- Optional stricter **TTS `503`** when all cloud providers fail (today: browser **`speechSynthesis`** fallback contract).
- Richer **ExpertInterviewStage** polish (e.g. review countdown UI, Whisper confidence UX) as needed.

**Recently closed (v1.3):** v2 **integrity merge**; **multi-pass** evaluation; **30-minute** cap + **`timeExpired`**; **turnId** checks through acknowledgement TTS; **turnLog** timing + **`whisperLatencyMs`**; **speculative warmup** on full turn; **silence nudge**; **candidate review request**; **admin question analytics** + **session replay**.

---

## 12. Implementation changelog — shipped in repo

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
| **Antigravity parity (v1.3)** | **`evaluationService.ts`**: **`evaluateFullInterviewMultiPass`** (3× parallel, merged scores, strictest claim credibility). **`Interview`**: **`evaluationPassCount`**, **`evaluationScoreVariance`**. |
| **Orchestrator (v1.3)** | v2 completion: **integrity merge** (proctoring + anti-gaming → **`integrityFlag`**, **`riskScore`**); **`InterviewQuestionResult`** from **`per_question_scores`**; **`turnLog`** timing + snapshot fields; **`timeExpired`** when **`completionReason === time_limit`**. |
| **Routes (v1.3)** | **`v2/turn`**: **`whisperLatencyMs`**, fire-and-forget **`handlePartialTranscript`** on full answer; **`request-review`** validation (409 duplicate). **`GET /:id/result`**: **`completedAt`**, **`reviewRequestedAt`**. |
| **Admin (v1.3)** | **`GET /admin/questions/analytics`** (join bank, discrimination flags); **`GET /admin/interviews/:id/replay`**; UI **`InterviewReplayView`** + **`AIInterviewReview`** replay + analytics table. |
| **Frontend (v1.3)** | Silence nudge; **turnId** re-check after ack / gap / before question TTS; **`whisperLatencyMs`** from last segment; **time-expired** banner; **request-review** form. |

---

## 13. Document map

| Need | Read |
|------|------|
| This overview + **what shipped** (§12) | **This file** |
| Full product + checklist + voice + §16 code status | `PRD_AI_INTERVIEW_ROUND.md` |
| Scorecard math & stage floors | `PRD_VERIFICATION_SCORING.md` |
| Whole product context | `PRD.md` §3.4 |

*Consolidated for stakeholders who want one efficient doc; the long PRD remains authoritative for edge cases and audit.*
