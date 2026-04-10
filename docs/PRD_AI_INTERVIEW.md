# PRD — AI Expert Interview (full specification)

**Consolidated April 2026.** Part A = concise master spec (stack, placement, APIs). Part B = full product specification (formerly *PRD_AI_INTERVIEW_ROUND*).

**Index:** [PRD.md](PRD.md) (index) · Candidate summary: [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.4 · Revenue & retakes: [PRD_BUSINESS.md](PRD_BUSINESS.md) · [README.md](README.md)

<a id="part-a--master-summary"></a>

## Part A — Master summary

## 1. Purpose

- **Candidate:** Structured technical dialogue (voice-first) that measures depth, reasoning, and communication—not static Q&A only.
- **Employer signal:** A **0–100** AI interview score and badge (Elite / Gold / Silver / Not Verified) feeding the **Skill Passport** and recruiter views.
- **Philosophy:** **Adversarial v2** probes failure boundaries via dynamic follow-ups (weakness, discrepancy, reasoning probes), not flash-card correctness.

---

## 2. Verification placement & gating

| Stage | Name | Notes |
|-------|------|--------|
| 1–3 | Profile, Aptitude/CS fundamentals, DSA | Prerequisites (exact `stageName` depends on `VERIFICATION_PIPELINE_V2`; see [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.0) |
| **Late pipeline** | **AI Expert Interview** | Verification stage `expert_interview`; interview type **`ai_expert`**. *Legacy copy* calls this “Stage 4”; in **pipeline v2** it follows **AI Skills** (all tiers) and **System Design** (**`system_design_interview`** software mid/senior, **`data_system_design`** data mid/senior). **Data profiles** use the same v2 engine with **data-calibrated** sprints and evaluation meta. |
| Human step | Human expert interview | Separate PRD; `human_expert_interview` where enabled |

**Retakes / cooldowns** for `expert_interview` sessions: **[PRD_BUSINESS.md](PRD_BUSINESS.md)** + `gateExpertInterviewStart` in `interview.ts`.

**Technical scorecard blend:** `aptitude × 0.25 + DSA × 0.35 + AI_interview × 0.40` (each arm 0–100).  
**Typical unlock to Stage 5:** combined rules + floors (e.g. aptitude ≥ 55, DSA ≥ 60, **AI interview ≥ 60**)—see `buildTechnicalScorecard()` and **[PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.1** (canonical scorecard box) and **§11**.

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
| **STT (verification Expert + AI Skills stages)** | Accurate, segmented capture without coupling to live partials | **Primary:** **`useWhisperSession`** — browser records audio in segments with pause detection, **`POST /api/interview/transcribe`** (**OpenAI Whisper**, `whisper.service.ts`). UI guides “pause ~1.5s” to finalize segments; client debounces TTS tail so model audio is not transcribed as the user. **`ExpertInterviewStage.tsx`** and **`AISkillsInterviewStage.tsx`**. |
| **STT (alternate hook, not wired to Expert / AI Skills UI)** | Live streaming + prefetch | **`useDeepgramSession.ts`** + **`GET /api/interview/deepgram-token`** (**nova-3** JWT) + **`/v2/partial`** for prefetch — **not imported** by Expert or AI Skills stages today; reserved for future live room UX or other surfaces. |
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
- `GET /api/interview/deepgram-token` — browser **Deepgram** live STT credential (alternate path — not used by Expert/AI Skills UIs today).
- `POST /api/interview/tts` — AI voice: **MP3** stream (**Cartesia** or **ElevenLabs**) or JSON **`{ fallback: true, text }`** for browser **`speechSynthesis`**.
- `GET /api/interview/tts-filler` — filler line (precached MP3 when warmed).
- `POST /api/interview/transcribe` — **OpenAI Whisper** transcription of user audio (multipart); used by **`useWhisperSession`** on **Expert** and **AI Skills** stages.

**Admin (human gate):** `GET /api/admin/ai-interview-queue/pending`, `POST /api/admin/ai-interview-queue/:id/approve`, `POST .../reject` — see `humanInterviewGate.service.ts`.

**Admin (interview analytics & replay):** `GET /api/admin/questions/analytics` — grouped **`InterviewQuestionResult`** stats joined to **`InterviewQuestionBank`**, **`discriminationFlag`** (`too_hard` / `too_easy` / `good`). `GET /api/admin/interviews/:id/replay` — interview summary, **`messages`**, **`questionResults`**, **`turnLog`** from `questionPlan[0]`, **`ProctoringEvent`** rows (register **`/interviews/pending-review`** before **`:id`** routes). UI: **`AIInterviewReview`** (replay dialog + analytics table) and **`InterviewReplayView.tsx`**.

**v1 (legacy):** `POST /api/interview/start`, `POST /api/interview/respond`, result endpoints—as documented in **this file** (`#appendix-a--baseline--legacy-v1`).

**Frontend:** `src/pages/verification/stages/ExpertInterviewStage.tsx` — **`useWhisperSession`** (passes **`whisperLatencyMs`** into **`onFinal`** for **`/v2/turn`**), **`useProctoringRiskMonitor`**, client **`turnId`** with **stale discard on response and again after acknowledgement TTS / gap / before main question TTS**, **~5s silence nudge** while listening, **`timeExpired`** banner, **request-review** UI after completion. **`VerificationFlow.tsx`** passes **`verificationRoleType`** and **`experienceYears`** so non-technical/data/profile-title candidates skip the software role dropdown and send **profile-aligned** **`jobRole`** / derived **`experienceLevel`** to **`v2/start`**. **`AISkillsInterviewStage.tsx`** uses the **same** Whisper + TTS client pattern with **`/api/interview/ai-skills/turn`**. **`useDeepgramSession.ts`** exists but is **not** mounted on Expert or AI Skills stages today.

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
- **Admin:** Pending review queue, re-evaluate, question CRUD, **question analytics**, **session replay** — see [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.4 and this document.
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
| **PRD + Expert UX (v6.8)** | **[PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.4.9** — questions, relevance mechanics, STT/TTS rationale, step-by-step answer flow; **§3.4.3** corrected to **OpenAI Whisper** (primary) + **Cartesia→ElevenLabs** TTS. **`VerificationFlow.tsx`** → **`ExpertInterviewStage`**: **`verificationRoleType`**, **`experienceYears`**, profile-driven **`v2/start`** when non-tech / data / non-empty **`targetJobTitle`**. |
| **AI Skills (doc parity)** | **`AISkillsInterviewStage`** documented as sharing **`useWhisperSession`** + **`/transcribe`** + interview TTS routes (§3.4.9). |

---

## 13. Document map

| Need | Read |
|------|------|
| This overview + **what shipped** (§12) | **This file** |
| Full product + checklist + voice + §16 code status | This file `#part-b--detailed-specification` |
| Scorecard math & stage floors | [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.1 (canonical box) and §11 |
| Whole product context | [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.4 |

*Consolidated for stakeholders who want one efficient doc; the long PRD remains authoritative for edge cases and audit.*

---

<a id="part-b--detailed-specification"></a>

## Part B — Detailed specification

# Sections 1–10 — Pro Upgrade specification

## 1) Question Bank Governance

### 1.1 Problem (baseline)

All questions live in static arrays in `server/src/routes/interview.ts` (`ROLE_PLANS`, `HR_QUESTIONS`). Admins cannot add, edit, or retire questions without a deploy.

### 1.2 Prisma: `InterviewQuestionBank`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` `@id` `@default(uuid())` | Primary key |
| `role` | `String` | e.g. `frontend`, `backend`, `fullstack`, `qa`, `ml`, `devops`, `data`, `mobile`, `software` |
| `experienceLevel` | `String` | `junior` \| `mid` \| `senior` (see §4) |
| `type` | `String` | `conceptual` \| `scenario` \| `problem_solving` \| `behavioral` |
| `prompt` | `String` | Question text shown to candidate |
| `keyPoints` | `Json` | `string[]` — ideal answer criteria for evaluator |
| `difficulty` | `Int` | 1 (easy)–5 (hard), for calibration / analytics |
| `isActive` | `Boolean` | `@default(true)` — soft retire |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `createdBy` | `String?` | Admin user id (optional) |
| `tags` | `String[]` | Optional e.g. `["react","hooks"]` |

**Indexes (recommended):** `[role, experienceLevel, type, isActive]` for selection queries.

### 1.3 Prisma: `InterviewQuestionResult`

Per-question scored outcome, linked to the candidate’s answer message (not a replacement for `InterviewMessage`).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` `@id` `@default(uuid())` | Primary key |
| `interviewId` | `String` | FK → `Interview` |
| `messageId` | `String` | FK → `InterviewMessage` (the user answer row) |
| `questionBankId` | `String?` | FK → `InterviewQuestionBank` (null for legacy static-bank interviews) |
| `questionIndex` | `Int` | 0-based index in this interview’s plan |
| `questionType` | `String` | Copied from plan at interview time |
| `scoreConceptual` | `Float?` | 0–100 |
| `scoreReasoning` | `Float?` | 0–100 |
| `scoreCommunication` | `Float?` | 0–100 |
| `rationale` | `String?` | 1–2 sentence AI rationale |
| `keyPointsHit` | `String[]` | Key points addressed |
| `keyPointsMissed` | `String[]` | Key points missing |
| `flagAntiGaming` | `Boolean` | `@default(false)` (see §8) |
| `flagReason` | `String?` | Anti-gaming / authenticity flag reason |

### 1.4 Admin API (`requireAdmin`)

Base path: **`/api/admin/questions`**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/questions` | List with filters: `?role=&level=&type=&isActive=&tag=` |
| `POST` | `/api/admin/questions` | Create: `role`, `experienceLevel`, `type`, `prompt`, `keyPoints[]`, `difficulty`, `tags[]` |
| `PATCH` | `/api/admin/questions/:id` | Update `prompt`, `keyPoints`, `difficulty`, `isActive`, `tags` |
| `DELETE` | `/api/admin/questions/:id` | **Soft delete:** `isActive=false` only (no hard delete) |
| `GET` | `/api/admin/questions/analytics` | Per-question stats: avg score, discrimination proxy, usage count |

### 1.5 Seed / migration script (`scripts/seedQuestions.ts`)

One-time script:

1. Import or read current `ROLE_PLANS` and `HR_QUESTIONS` from `server/src/routes/interview.ts` (or a shared module extracted for import).
2. Set `experienceLevel = 'mid'` for all seeded rows (safe default).
3. Set `difficulty` by type: `behavioral=1`, `conceptual=2`, `scenario=3`, `problem_solving=4`.
4. Insert into `InterviewQuestionBank` with `isActive=true`.

### 1.6 Rollback-safe source flag: `QUESTION_BANK_SOURCE`

- **Env (server):** `QUESTION_BANK_SOURCE=static` \| `db`
- **Default:** `static` until DB seed is verified in staging/production.
- **`.env.example`:** document the flag and rollout steps.

### 1.7 `buildQuestionPlan(role, experienceLevel)` (DB + fallback)

When `QUESTION_BANK_SOURCE=db`:

1. **Tech (7):** `WHERE role = ? AND experienceLevel = ? AND type != 'behavioral' AND isActive = true` → `ORDER BY RANDOM() LIMIT 7`.
2. **HR (4):** `WHERE type = 'behavioral' AND isActive = true` → `ORDER BY RANDOM() LIMIT 4`.

If fewer than 7 tech rows are returned, **fall back to static arrays** (current `ROLE_PLANS` / `HR_QUESTIONS`) for that interview so candidates are never blocked.

Persist the resolved plan on `Interview.questionPlan` JSON (include `id` from bank when sourced from DB for traceability).

---

## 2) Per-Question Scoring

### 2.1 Gemini JSON output contract (required)

Extend `evaluateInterview()` in `server/src/services/ai.service.ts` to require **aggregate** fields **plus** `per_question_scores`.

```json
{
  "technical_accuracy": 0,
  "depth_of_knowledge": 0,
  "problem_solving": 0,
  "communication_clarity": 0,
  "concept_score": 0,
  "reasoning_score": 0,
  "communication_score": 0,
  "confidence_score": 0,
  "strengths": [],
  "weaknesses": [],
  "final_verdict": "",
  "confidence_level": "High|Medium|Low",
  "authenticity_concern": false,
  "authenticity_reason": "",
  "per_question_scores": [
    {
      "question_index": 0,
      "score_conceptual": 0,
      "score_reasoning": 0,
      "score_communication": 0,
      "rationale": "",
      "key_points_hit": [],
      "key_points_missed": []
    }
  ]
}
```

- `authenticity_*` comes from the anti-gaming prompt addition (§8.3).
- Aggregates remain compatible with existing `computeScore()` weighting unless product explicitly changes weights in the same release.

### 2.2 Finalization write loop (pseudocode)

After successful parse of evaluation JSON on **final** `POST /api/interview/respond`:

```text
for each qs in evaluation.per_question_scores:
  resolve messageId = candidateAnswerMessageIdForIndex(qs.question_index)
  // messageId must map to the user message for that question index (not AI prompt rows)
  create InterviewQuestionResult {
    interviewId,
    messageId,
    questionBankId: plan[qs.question_index].questionBankId ?? null,
    questionIndex: qs.question_index,
    questionType: plan[qs.question_index].type,
    scoreConceptual: qs.score_conceptual,
    scoreReasoning: qs.score_reasoning,
    scoreCommunication: qs.score_communication,
    rationale: qs.rationale,
    keyPointsHit: qs.key_points_hit,
    keyPointsMissed: qs.key_points_missed,
    flagAntiGaming: /* from message-level signals + evaluator if needed */,
    flagReason: /* optional aggregate */
  }
```

**Implementation note:** Do not use a fragile `transcriptMessages[question_index * 2 + 1]` mapping in production—derive `messageId` by iterating transcript in order and pairing each AI question with the following user message, or store `questionIndex` on `InterviewMessage` when creating user rows.

### 2.3 Extended `GET /api/interview/:id/result`

Add **`perQuestionScores`** for admin / review tools (not shown to candidates — §7):

```json
{
  "totalScore": 78,
  "badgeLevel": "Gold Verified",
  "finalVerdict": "...",
  "scoreBreakdown": {},
  "perQuestionScores": [
    {
      "questionIndex": 0,
      "questionType": "conceptual",
      "questionPrompt": "Explain closures in JS",
      "scoreConceptual": 82,
      "scoreReasoning": 75,
      "scoreCommunication": 90,
      "rationale": "Candidate demonstrated clear understanding...",
      "keyPointsHit": ["lexical scope", "closure over variables"],
      "keyPointsMissed": ["garbage collection implication"]
    }
  ]
}
```

---

## 3) Fallback Evaluation

### 3.1 Canonical fallback payload (exact)

On Gemini failure inside `evaluateInterview()` catch, return **this** JSON string (values fixed):

```json
{
  "technical_accuracy": 5,
  "depth_of_knowledge": 5,
  "problem_solving": 5,
  "communication_clarity": 5,
  "concept_score": 50,
  "reasoning_score": 50,
  "communication_score": 50,
  "confidence_score": 50,
  "strengths": ["Evaluation unavailable — interview flagged for manual review."],
  "weaknesses": ["Evaluation unavailable — interview flagged for manual review."],
  "final_verdict": "PENDING_MANUAL_REVIEW",
  "confidence_level": "Low",
  "fallback_triggered": true,
  "fallback_reason": "gemini_timeout",
  "per_question_scores": []
}
```

- Set `fallback_reason` to the actual error message or a normalized code (e.g. `gemini_timeout`, `gemini_5xx`).

### 3.2 Interview row when `fallback_triggered === true`

| Field | Value |
|-------|--------|
| `totalScore` | `50` (neutral) |
| `badgeLevel` | `Pending Review` |
| `status` | `pending_review` (**new** interview status; migrate from string-only if needed) |
| `reviewFlag` | `true` (**new** `Boolean` on `Interview`) |
| `reviewReason` | `gemini_evaluation_failed` (**new** `String?`) |

Do **not** treat as normal `completed` for candidate-facing badges until re-eval completes.

### 3.3 Candidate-facing copy (API + UI)

When `status === pending_review`, result payload should include (or UI maps from):

> **Your interview responses have been recorded successfully. Our evaluation system encountered a technical issue — your interview has been flagged for manual review and you will receive your result within 24 hours. This does not affect your application status.**

### 3.4 Admin queue + re-evaluation

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/interviews/pending-review` | All `Interview` where `status = pending_review`, `ORDER BY completedAt ASC` |
| `POST /api/admin/interviews/:id/re-evaluate` | Re-run `evaluateInterview()` using **stored** transcript + plan; on success, clear `pending_review`, set real scores, clear `reviewFlag` as appropriate |

---

## 4) Role + Experience Calibration

### 4.1 Candidate UX: `experienceLevel`

Required alongside `jobRole` on start:

| Value | Label |
|-------|--------|
| `junior` | 0–2 years of experience |
| `mid` | 2–5 years of experience |
| `senior` | 5+ years of experience |

### 4.2 API: `POST /api/interview/start`

Request body:

```json
{
  "jobRole": "Backend Developer",
  "experienceLevel": "senior"
}
```

- Persist `experienceLevel` on `Interview`.
- Pass into `buildQuestionPlan(role, experienceLevel)` for DB selection.

### 4.3 Evaluator prompt: rubric calibration block

Append to `evaluateInterview()` system prompt based on `experienceLevel`:

| Level | Instruction |
|-------|-------------|
| **junior** | Foundational understanding, clear communication, willingness to learn. Score 70+ for correct core concepts even if depth is limited. Do not penalize missing advanced edge cases. |
| **mid** | Solid practical application and trade-off reasoning. Expect familiarity with tooling and common patterns. Score 70+ for correct application with reasonable trade-off awareness. |
| **senior** | Depth, systems thinking, trade-off articulation, mentoring signal. Score 70+ only with ownership and architectural awareness. Penalize surface-level answers. |

### 4.4 Recruiter-facing label (uniform badge thresholds)

Badge cutoffs stay **global**: Elite ≥90, Gold ≥75, Silver ≥60, else Not Verified.

Add recruiter copy:

> This score reflects performance against a **[Junior / Mid-Level / Senior]** benchmark. Scores are not directly comparable across experience levels.

---

## 5) Voice Transcription Quality

### 5.1 Confidence thresholds (`SpeechRecognition` result confidence, 0–1)

| Range | Behavior |
|-------|----------|
| **0.85 – 1.0** | Auto-accept into answer field; no warning |
| **0.60 – 0.84** | Show yellow inline: *Low confidence transcription — please review before submitting.* |
| **&lt; 0.60** | Do not auto-fill. Show: *We could not reliably transcribe your response. Please type your answer or try speaking again.* Clear stale auto text |

### 5.2 Five-second review window

After a voice segment finalizes:

- Show editable textarea with transcript.
- **Submit disabled** for **5 seconds** with countdown: *Review your answer — submitting in 5s*.
- Candidate may edit; **evaluated text = final textarea** (not raw audio).

### 5.3 Typed input always available

- Toggle: **Switch to typed input** at all times.
- Persist per answer: `inputMode`: `voice` \| `typed` on `InterviewMessage`.
- Evaluator does not treat modes differently.

### 5.4 `InterviewMessage` additions

| Field | Type | Purpose |
|-------|------|---------|
| `transcriptionConfidence` | `Float?` | 0–1 when voice; null if typed |
| `inputMode` | `String` | `@default("typed")` — `voice` \| `typed` |
| `rawTranscript` | `String?` | Machine transcript **before** candidate edits |

`audioUrl` remains; when voice is used, continue uploading when applicable.

---

## 6) Proctoring Thresholds

### 6.1 Violation counts (interview completion)

**Do not** compute or persist a weighted 0–100 proctoring “risk score.” Instead:

1. **Per-signal counts:** For each proctoring event type, count how many times that signal was logged for the interview session (`sessionId = interviewId`, `testType = ai_interview`). Each stored `ProctoringEvent` row is one log; the integer field `riskScore` on that row is the **1-based violation index for that signal type** in the session at log time (legacy column name).
2. **Persist on `Interview`:** `riskScore Float?` holds the **total number of proctoring alert rows** for that interview (for admin sorting — not a calibrated risk index). `integrityFlag String?` is derived from aggregated counts (and merged with anti-gaming severity — see below).

### 6.2 Integrity bands (from counts + anti-gaming)

**Proctoring-only tiering** (from raw event rows for the session):

- **`review_recommended`:** e.g. `maxPerType ≥ 3` **or** `total rows ≥ 8`
- **`review_required`:** e.g. `maxPerType ≥ 5` **or** `total rows ≥ 18`
- **`integrity_violation`:** e.g. `maxPerType ≥ 10` **or** `total rows ≥ 40`

**Anti-gaming** still produces a 0–100-style point roll-up from answer-quality signals; that maps to the **same** flag scale, and the **stricter** of (proctoring flag, anti-gaming flag) wins.

| Outcome | Action |
|---------|--------|
| **No flag** | Normal flow |
| **`review_recommended`** | Soft flag; yellow on admin; **shortlist not blocked** (unless other gates fail) |
| **`review_required`** | **Shortlist blocked** until admin clears |
| **`integrity_violation`** | Interview treated as integrity failure; `buildTechnicalScorecard()` may use **`ai_interview_score = 0`** per product rules; admin may override |

### 6.3 Admin override + audit log

New table **`ProctoringReviewLog`**:

- `id`, `interviewId`, `adminId`, `action` (e.g. approve / reject), `note` (required), `createdAt`

Admin UI shows: event timeline, **per-signal counts**, total rows, current `integrityFlag`, **Override** with mandatory note — every action appends a log row.

---

## 7) Candidate Explainability

### 7.1 Result screen — what to show

| Element | Rule |
|---------|------|
| **Badge** | Large: Elite / Gold / Silver / Not Verified — immediately on completion |
| **Numeric score** | Show **only if** badge ≠ Not Verified (hide low numbers for rejected to reduce drop-off) |
| **Final verdict** | Full `final_verdict`, max ~3 sentences, all outcomes |
| **Strengths** | Bullets, header: *What you did well* |
| **Areas to improve** | Bullets; **do not** use the word “weaknesses” in UI |
| **Per-question breakdown** | **Never** for candidate — admin only |
| **Badge on profile** | Persistent with verification timestamp |
| **Retake** | Copy: *30-day cooldown before retake is available*; retake resets badge |

### 7.2 `pending_review` UX

- Neutral **Under Review** state (gray — not a verification badge).
- Show §3.3 message; **no score or verdict**.
- *Expected result: within 24 hours*
- Email when admin finishes re-eval and sets real outcome.

### 7.3 One-time review request (7-day gate)

New `Interview` fields:

| Field | Purpose |
|-------|---------|
| `reviewRequestedAt` | When candidate requested |
| `reviewRequestReason` | Short text, max 500 chars |
| `reviewOutcome` | `confirmed` \| `adjusted` |
| `reviewOutcomeNote` | Admin note surfaced to candidate |

Rules:

- **Once** within **7 days** of completion.
- Sets queue reason `candidate_dispute` (or equivalent); admin sees transcript + per-question scores; may adjust or confirm score.

---

## 8) Anti-Gaming

### 8.1 Signals

| Signal | Logic |
|--------|--------|
| Too long | `length > 2000` → flag + anti-gaming points (§6.2 merge) |
| Too short | Technical Q, `length < 20` → anti-gaming points |
| Repetition | Jaccard similarity between answer pairs; if **any pair &gt; 0.6** → flag repetitive |
| Paste | Frontend `paste` listener → increment `pasteCount` on message / interview; align with existing proctoring copy-paste events |
| Homogeneous structure | Evaluator notes identical patterns (e.g. every answer starts *Great question…*) → reflect in `authenticity_concern` |
| Too fast | `timeToSubmitSeconds &lt; 5` from question shown → implausible speed flag |

### 8.2 `InterviewMessage` additions

| Field | Type |
|-------|------|
| `answerLengthChars` | `Int` |
| `pasteCount` | `Int` `@default(0)` |
| `timeToSubmitSeconds` | `Int?` |
| `flagAntiGaming` | `Boolean` `@default(false)` |
| `flagReason` | `String?` (comma-separated signal keys) |

### 8.3 Evaluator prompt addition

Append:

> Also assess answer authenticity. Flag if: (1) answers appear AI-generated (overly structured, formulaic intros such as “Great question”), (2) answers share identical structure across questions, or (3) content is clearly off-topic. Return **`authenticity_concern`**: true/false and **`authenticity_reason`**: brief string if true.

### 8.4 Aggregation

Before `computeScore()` at finalization:

1. Run `computeAntiGamingRisk(transcript, messages)` (new helper, e.g. `server/src/services/aiInterviewAntiGaming.service.ts` or `ai.service.ts`).
2. Merge with evaluator `authenticity_concern`.
3. Update `InterviewMessage.flagAntiGaming` / `flagReason` and set `Interview` violation totals / `integrityFlag` per §6.

---

## 9) Implementation checklist (24 tasks)

Paths match **this repo** (PDF used `client/` — here `src/`).

| # | Task | File / location |
|---|------|-----------------|
| 1 | Add `InterviewQuestionBank` model | `server/prisma/schema.prisma` |
| 2 | Add `InterviewQuestionResult` model | `server/prisma/schema.prisma` |
| 3 | Extend `InterviewMessage` (transcription + anti-gaming fields) | `server/prisma/schema.prisma` |
| 4 | Extend `Interview` (experience, review, violation totals, integrity flags) | `server/prisma/schema.prisma` |
| 5 | Add `ProctoringReviewLog` model | `server/prisma/schema.prisma` |
| 6 | Run Prisma migrate | CLI / `server/prisma/migrations/` |
| 7 | Implement `scripts/seedQuestions.ts` + wire in `server/package.json` | `scripts/seedQuestions.ts` |
| 8 | Document `QUESTION_BANK_SOURCE` + rollout | `.env.example`, `docs/DEPLOYMENT_*.md` if needed |
| 9 | `buildQuestionPlan(role, experienceLevel)` + DB + static fallback | `server/src/routes/interview.ts` |
| 10 | `POST /api/interview/start` accept `experienceLevel` | `server/src/routes/interview.ts` |
| 11 | Finalization: persist `InterviewQuestionResult` rows + stable message mapping | `server/src/routes/interview.ts` |
| 12 | `evaluateInterview()` — per-question JSON + calibration + authenticity | `server/src/services/ai.service.ts` |
| 13 | Canonical fallback payload + `pending_review` finalization branch | `server/src/services/ai.service.ts` + `interview.ts` |
| 14 | `computeAntiGamingRisk()` | `server/src/services/ai.service.ts` or `server/src/services/aiInterviewAntiGaming.service.ts` |
| 15 | `computeInterviewProctoringRiskScore()` (event table → points) | `server/src/services/verificationScoring.service.ts` or new `aiInterviewProctoring.service.ts` |
| 16 | `buildTechnicalScorecard()` — `ai_interview_score = 0` when `integrity_violation` | `server/src/services/verificationScoring.service.ts` |
| 17 | Extend `GET /api/interview/:id/result` with `perQuestionScores` | `server/src/routes/interview.ts` |
| 18 | `GET /api/admin/interviews/pending-review` + `POST .../re-evaluate` | `server/src/routes/admin.ts` |
| 19 | Admin question bank CRUD + analytics (5 routes) | `server/src/routes/admin.ts` |
| 20 | Admin UI: question bank + pending interview queue + override + logs | `src/pages/admin/AdminDashboard.tsx` and/or new admin components |
| 21 | `experienceLevel` selector on start | `src/pages/verification/stages/ExpertInterviewStage.tsx` |
| 22 | Transcription confidence UI + 5s edit window + typed toggle | `ExpertInterviewStage.tsx` |
| 23 | Paste listener + question timestamp + `timeToSubmitSeconds` + payload fields | `ExpertInterviewStage.tsx` + `interview.ts` respond body |
| 24 | Result UX: explainability, `pending_review`, 7-day review request + emails | `ExpertInterviewStage.tsx` and/or `src/components/interview/InterviewResult.tsx` (extract if needed) + email util |

---

## 10) Dependency summary

| Dependency | Notes |
|------------|--------|
| Prisma | New models + fields; migrations as deployed |
| Gemini | `@google/genai`; model tiers per §14.5 |
| Deepgram | **nova-3** target; STT over browser WebSocket; short-lived JWT from `/v1/auth/grant` (see §13.4 implementation note) |
| Cartesia | Primary TTS — `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` (§12.6) |
| ElevenLabs | Fallback TTS — `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| `QUESTION_BANK_SOURCE` | `static` default; `db` after seed verified |
| Admin auth | `requireAdmin` on admin routes |
| Email | `pending_review` + review-request outcomes |
| Frontend STT | Optional `@deepgram/sdk` if product standardizes on SDK (today: native `WebSocket`) |

---

# Section 11 — Adversarial Interview Engine

## 11.1 Philosophy

The interview probes **failure boundaries of understanding**, not flash-card correctness. Every answer triggers parallel agents; follow-ups are generated in real time from what the candidate just said.

## 11.2 Sprint structure

**Total:** 15 questions across 3 sprints × 5 questions.

| Sprint | Name | Persona | Goal |
|--------|------|---------|------|
| 1 | Project Defense | `curious_lead` | Ownership, decisions, failures — what they actually built |
| 2 | Foundations | `socratic_mentor` | Conceptual depth — reasoning, not trivia |
| 3 | System Design | `senior_peer` | Trade-offs, scaling, failure modes, alternatives |

**Track variants (canonical code):** **Non-technical** uses `NON_TECH_SPRINTS` / `NON_TECH_OPENERS`. **Data (`roleType === "data"`)** uses `DATA_SPRINTS` / `DATA_OPENERS` and passes **`dataTrack` + `dataSubtrack`** into `generateSprintQuestion` and `evaluateFullInterview` (`agents.ts`). **Software** uses `SPRINTS` / `SPRINT_OPENERS` above.

**Openers (fixed when each sprint begins):** Marketing copy below; **canonical strings** for the **software** track are `SPRINT_OPENERS` in **`server/src/services/interview/orchestrator.ts`** (non-tech and data openers live in the same file under their own constants).

1. *Tell me about a project from your background that you're genuinely proud of — what problem were you trying to solve, and why did it matter?*
2. *Let's talk about the technical concepts behind your work. Pick one idea at the core of what you've built — how would you explain it to someone encountering it for the first time?*
3. *Let's think through a design problem. Imagine you're building a system to serve real-time predictions for millions of users — where would you start, and what are the hardest parts to get right?*

## 11.3 Personas (summary)

- **curious_lead:** Curious, non-confrontational; “why that choice?”; ownership and honest failure.
- **socratic_mentor:** Plain-language explanation, think-aloud, acknowledge good reasoning before pushing.
- **senior_peer:** Real constraints, trade-offs, scale (“10x load”), collaborative design tension.

## 11.4 Agent pipeline (every turn)

Executed in parallel after each candidate answer:

| Agent | Role | Model tier (spec) |
|-------|------|-------------------|
| WeaknessAgent | Main reasoning gap | balanced |
| ConceptAgent | Extract technical concepts for prefetch | fast |
| DiscrepancyAgent | Resume vs answer consistency | balanced |
| ReasoningBehaviorAgent | Meta-cognition (structure, adaptability, calibration) | balanced |

**Weakness types:** `missing_step` | `vague` | `incorrect` | `shallow` | `overconfidence`  
**Attack strategies:** `implementation_probe` | `edge_case` | `scaling` | `contradiction` | `step_by_step`  
**Severity:** `high` | `medium` | `low` — sprint context shifts emphasis (see product prose in v3 board).

**Discrepancy output:** `{ conflict, description, severity: "low" | "high" }`  
**Reasoning behavior:** structure score 0–3, clarification behavior, adaptability, confidence calibration.

## 11.5 Follow-up priority

1. Resume discrepancy (`conflict` AND `severity=high`) → `generateDiscrepancyFollowup()`
2. Weakness `severity=high` → `generateWeaknessFollowup()`
3. Else prefetched question (from cache keyed by `interviewId`) if valid
4. Else `generateSprintQuestion()` — aligned to sprint, no repeats from history

## 11.6 Prefetch

On **`/v2/partial`** payloads and **fire-and-forget** **`handlePartialTranscript`** after a **committed** answer: extract concepts, enqueue ~2 candidate follow-ups in memory (`prefetchCache`), **Flash-only** — no weakness evaluation on partials. **Production Expert UI** primarily supplies text via **Whisper segments**; **Deepgram** final partials are the historical/spec path when a client mounts **`useDeepgramSession`**.

## 11.7 Interview state

Stored in `Interview.questionPlan` JSON (single object in array): `sprint`, `persona`, `sprintName`, `questionCount`, `sprintQuestionCount`, `history[]`, `weaknesses[]`, `reasoningSignals[]`, `lastQuestion`, `interviewStartTime`, plus optional **`trackNonTechnical`**, **`nonTechSubtrack`**, **`trackData`**, **`dataSubtrack`** for calibration (see `orchestrator.ts`).

## 11.8 Sprint progression & termination

- After 5 questions in a sprint → advance; next question is next sprint **opener**.
- **Terminate** when: 15 questions completed **or** sprint 3 exhausted **or** **30 minutes** elapsed since `interviewStartTime` (product rule — verify §16).
- On complete → `evaluateFullInterview()` → persist scores → `complete: true`.

---

# Section 12 — Voice architecture

## 12.0 Verification STT path (shipped — Expert + AI Skills)

**What candidates use today** on **`ExpertInterviewStage`** and **`AISkillsInterviewStage`**:

- **Capture:** `MediaRecorder` + RMS **VAD** (~**1.5s** silence) in **`useWhisperSession.ts`**.
- **Transcription:** **`POST /api/interview/transcribe`** → **OpenAI** **`whisper-1`** (`whisper.service.ts`), English, verbose JSON → transcript + **high/medium/low** confidence.
- **Relevance:** Segmented post-hoc STT prioritizes **accurate text** for Gemini **weakness / discrepancy / reasoning** agents over streaming partial latency.
- **Telemetry:** Last segment **`whisperLatencyMs`** attached to **`/v2/turn`** or AI Skills **`turn`** for **`turnLog`**.

**§12.1** below describes the **alternate Deepgram live** architecture (prefetch / future surfaces); it is **not** the active mic path on these verification stages unless product rewires the client.

## 12.1 STT — Deepgram nova-3 (alternate / target live path)

- **Transport:** Browser `WebSocket` to `wss://api.deepgram.com/v1/listen` — audio **does not** go through ProvenHire API.
- **Auth:** Backend `GET /api/interview/deepgram-token` returns credentials for the browser (see §13.4 implementation note).
- **Parameters (target):**

```
model: nova-3
language: en
encoding: linear16
sample_rate: <match AudioContext, typically 48000; spec may standardize 16000>
channels: 1
interim_results: true
vad_events: true
endpointing: 1200
utterance_end_ms: 2500
```

- **Buffering:** accumulate `is_final` fragments; flush on `UtteranceEnd` or 5s safety timer; never commit answer on partial alone.

## 12.2 Floor manager

States: `idle` | `user_speaking` | `ai_thinking` | `ai_speaking`.

- **Barge-in:** On `SpeechStarted` while AI is speaking → abort TTS (AbortController), floor → `user_speaking`.
- **Silence nudge (product):** If `user_speaking` & ~5s silence → short filler (“Take your time…”) — optional per §16.

## 12.3 TTS — Cartesia (primary) → ElevenLabs (fallback)

**Cartesia (target):** `POST https://api.cartesia.ai/tts/bytes` with `Cartesia-Version`, `X-API-Key`, body `model_id: sonic-english`, `transcript`, `voice`, `output_format` MP3 44100.

**ElevenLabs (fallback):** stream `eleven_turbo_v2_5` as today.

**Final fallback:** Browser `speechSynthesis`.

## 12.4 Filler-first latency masking

On utterance end: play low-latency filler via `GET /api/interview/tts-filler` + TTS immediately; run agents; abort filler when main response TTS is ready (product ideal). Filler list: “Hmm, interesting.”, “Got it.”, “I see.”, “That makes sense.”, “Alright.”, “Let me think about that.”

## 12.5 Turn ID — stale response protection

Each turn exposes a **`turnId`** (UUID in spec). Frontend keeps `currentTurnId`; discard responses where `response.turn_id !== currentTurnId`. Barge-in increments turn id so in-flight completions drop (spec).

## 12.6 Environment variables

```
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
CARTESIA_VOICE_ID=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
QUESTION_BANK_SOURCE=static
GEMINI_API_KEY=
```

## 12.7 Latency targets (product)

| Step | Target |
|------|--------|
| Filler first chunk | < 100 ms |
| Partial → concept path | < 200 ms |
| Agent pipeline | < 2000 ms |
| Stop speaking → AI audio starts | < 2500 ms (filler covers gap) |

## 12.8 Production voice UX — utterance hygiene and STT echo control

Problems addressed in **April 2026** ship:

| Issue | Mitigation |
|-------|-------------|
| LLM adds acknowledgements (“Thank you for sharing…”) before the real question | **Server:** `sanitizeAiInterviewQuestionText()` in **`server/src/services/interview/orchestrator.ts`** strips leading/trailing pleasantries before persistence, API `response`, and TTS source text. Closing messages when `complete: true` are not modified. |
| Same acknowledgement noise in agent outputs | **Server:** Persona and follow-up prompts in **`server/src/services/interview/agents.ts`** explicitly forbid thanks, praise, and filler before the question. |
| Speaker tail / room pick-up transcribed as the candidate’s answer (“thank you” in the answer panel) | **Client:** After AI TTS ends, **`POST_AI_SPEECH_COOLDOWN_MS`** (~520 ms) delay before re-enabling the mic (**`ExpertInterviewStage.tsx`**). Final Whisper segments are run through **`scrubSttEcho()`** to drop politeness-only lines and strip a leading “thank you / thanks …”. |

These behaviors are **production defaults** alongside Cartesia/ElevenLabs TTS and optional filler audio (**§12.4**).

---

# Section 13 — v2 API routes

All **new** interviews use v2; v1 remains for compatibility (§15).

## 13.1 `POST /api/interview/v2/start`

Body: `{ jobRole, experienceLevel? }`  
Response: `{ interviewId, question, sprint, sprintName, persona, totalSprints: 3, questionsPerSprint: 5 }`.

## 13.2 `POST /api/interview/v2/turn`

Body includes: `interviewId`, `answer`, `inputMode`, optional `transcriptionConfidence`, `audioUrl`, `pasteCount`, `timeToSubmitSeconds`.  
Response includes `response`, `sprint`, `persona`, `complete`, `weakness?`, `questionCount`, **`turnId`**, and when complete: `totalScore`, `badgeLevel`, `evaluation`.

## 13.3 `POST /api/interview/v2/partial`

`{ interviewId, text }` → `{ ok: true }`; background prefetch only.

## 13.4 `GET /api/interview/deepgram-token`

**Spec:** returns a credential for browser STT.

**As implemented (this repo):** `{ "token": string | null, "auth": "bearer" | "token" | null }` — prefers short-lived JWT from Deepgram `POST /v1/auth/grant`, else raw key with `auth: "token"`.

## 13.5 `POST /api/interview/tts`

**Spec:** stream MP3; Cartesia first, then ElevenLabs; `503` if both fail.

**As implemented:** **`server/src/services/tts.service.ts`** — Cartesia (when `CARTESIA_API_KEY` + `CARTESIA_VOICE_ID` set) → ElevenLabs → **`200` JSON** `{ "fallback": true, "text": "..." }` for browser `speechSynthesis` (no hard 503).

## 13.6 `GET /api/interview/tts-filler`

**Spec:** low-latency filler audio.

**As implemented:** Pre-cached MP3 from **`warmInterviewFillerCache()`** at API startup when a TTS provider is configured; response is **`audio/mpeg`** with optional header **`X-Filler-Text`** (URL-encoded phrase). Otherwise synthesizes a random phrase from the filler list.

---

# Section 14 — Evaluation (adversarial)

`evaluateFullInterview()` consumes full `history`, `resume`, accumulated `weaknesses`, `reasoningSignals`; aggregates reasoning; may emit **failure_surface**, **hire_recommendation**, **per_question_scores**, and maps to `Interview.totalScore`, `badgeLevel`, `scoreBreakdown` per §14.3–14.4.

**Badge thresholds:** Elite ≥ 90 · Gold ≥ 75 · Silver ≥ 60 · else Not Verified.

**Model tiers (spec):** Flash for agents; **Pro** for final full-interview evaluation — see §16 for exact model IDs in code.

---

# Section 15 — Route migration

- v1: `POST /api/interview/start`, `POST /api/interview/respond` — keep for old in-flight sessions.
- v2: `v2/start`, `v2/turn`, `v2/partial` — **ExpertInterviewStage** uses v2 for new sessions.
- Deprecation: after coexistence window, confirm no legacy in-progress interviews; retire v1 handlers.

---

# Section 16 — Repository implementation status (April 2026)

This section is the **engineering** view of §§11–15 above. Update when shipping.

| Area | Spec reference | Status |
|------|----------------|--------|
| Adversarial orchestrator + agents | §11 | **Shipped** — `server/src/services/interview/orchestrator.ts`, `agents.ts` |
| Parallel agents per turn | §11.4 | **Shipped** |
| Prefetch cache on partials | §11.6 | **Shipped** — `handlePartialTranscript`, in-memory cache; **`v2/turn`** also fires it on the **full** transcript (Whisper path) for warmup |
| Sprint openers / 15-question flow | §11.2, §11.8 | **Shipped** — `SPRINT_OPENERS`, `MAX_QUESTIONS`, `QUESTIONS_PER_SPRINT` |
| 30-minute hard stop | §11.8 | **Shipped** — `MAX_INTERVIEW_MINUTES` + `isInterviewComplete()` in `processTurn` |
| Interviewer utterance sanitization | §12.8 | **Shipped** — `sanitizeAiInterviewQuestionText()` + stricter agent prompts |
| STT echo / tail mitigation | §12.8 | **Shipped** — post-TTS mic cooldown + `scrubSttEcho` in `ExpertInterviewStage.tsx` |
| Turn ID stale response discard | §12.5, §13.2 | **Shipped** — client sends `turnId` (UUID); server echoes `turnId`; UI drops mismatched responses **and** re-checks after acknowledgement TTS, post-gap, and before main question TTS |
| Floor + TTS abort | §12.2 | **Shipped** — `AbortController` in `ExpertInterviewStage` + `useWhisperSession` discard while AI speaks |
| Primary STT (Expert + AI Skills UIs) | §12.0 | **Shipped** — OpenAI Whisper via **`useWhisperSession`** + **`POST /api/interview/transcribe`** (segmented upload); segment latency passed as **`whisperLatencyMs`** on **`v2/turn`** or **`ai-skills/turn`** for server **`turnLog`** |
| Deepgram **nova-3** / live WS STT | §12.1 | **Alternate path** — **`useDeepgramSession.ts`** + **`/api/interview/deepgram-token`**; not wired into **`ExpertInterviewStage`** or **`AISkillsInterviewStage`** today |
| Expert **`v2/start` context from profile | Part A §3.4.1 | **Shipped** — **`VerificationFlow`** passes **`verificationRoleType`** + **`experienceYears`**; read-only role summary + profile **`jobRole`** / derived **`experienceLevel`** when non-tech, data, or non-empty **`targetJobTitle`** |
| Cartesia TTS primary | §12.3 | **Shipped** — **`server/src/services/tts.service.ts`** (Cartesia → ElevenLabs); routes stream in `interview.ts` |
| TTS fallback shape | §13.5 | **Shipped** — `200` + `{ fallback: true }` + browser TTS (differs from spec `503`) |
| Filler TTS pre-cached at startup | §12.4 | **Shipped** — `warmInterviewFillerCache()` in server bootstrap; **`GET /api/interview/tts-filler`** |
| `deepgram-token` JWT | §13.4 | **Shipped** |
| v2 `/start`, `/turn`, `/partial` | §13 | **Shipped** |
| Gemini tiers in code | §14.5 | **Shipped** — `gemini-2.0-flash` (fast), `gemini-2.5-flash` (balanced), `gemini-2.5-pro` (deep) in `agents.ts` |
| Multi-pass final evaluation (3×) | §14 | **Shipped** — `evaluateFullInterviewMultiPass` in `evaluationService.ts`; `Interview.evaluationPassCount`, `evaluationScoreVariance` |
| v2 integrity merge (proctoring + anti-gaming) | §11 / integrity | **Shipped** — `orchestrator.ts` completion: same flag merge as v1 path; `integrityFlag`, `riskScore` |
| `turnLog` timing instrumentation | §11 / ops | **Shipped** — `whisperLatencyMs`, `agentPipelineMs`, `questionGenerationMs`, `totalTurnLatencyMs`, plus paste / snapshot fields |
| `InterviewQuestionResult` on v2 completion | §9 | **Shipped** — from `per_question_scores` in orchestrator finalize |
| 30-minute cap + `timeExpired` in API + UI | §11.8 | **Shipped** — `isInterviewComplete()` + `ExpertInterviewStage` banner |
| Candidate `POST /api/interview/:id/request-review` | Product | **Shipped** — 7-day gate, 10–500 char reason, 409 on duplicate; UI on results |
| Admin question analytics | Product | **Shipped** — `GET /api/admin/questions/analytics` (bank join, discrimination flags) |
| Admin session replay | Product | **Shipped** — `GET /api/admin/interviews/:id/replay` + `InterviewReplayView.tsx` |
| Pro Upgrade §§1–10 items | §9 checklist | Mixed — see [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.4 and task rows §9 |
| Silence nudge after 5s | §12.2 | **Shipped** — timer + short TTS while `user_speaking` in `ExpertInterviewStage` |

**Next engineering deltas (priority):** (1) Optional Deepgram **nova-3** in **`ExpertInterviewStage`** if product standardizes on live streaming STT, (2) optional strict **`503`** from TTS when all providers fail (vs current browser fallback contract), (3) continue Pro Upgrade checklist (§9) as needed.

---

# Appendix A — Baseline / legacy (v1)

*Verify in code before relying on line detail.*

- **Legacy plan:** Static / DB question bank via `QUESTION_BANK_SOURCE`, `POST /api/interview/start` + `respond` — still in `server/src/routes/interview.ts`.
- **Primary learner path:** **v2 adversarial** + `ExpertInterviewStage.tsx` + voice hooks.
- **Evaluator (v1 path):** `evaluateInterview()` aggregate JSON in `ai.service.ts`.
- **Scorecard:** Canonical formula, shortlist gate, and floors — **[PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.1** (boxed block). Implementation: `buildTechnicalScorecard()` in `verificationScoring.service.ts`. Detailed aptitude/DSA/AI breakdown: **§11** in that file.

Sections **1–15** are the target product spec; **§16** tracks repository drift.

---

## Document history

| Version | Change |
|---------|--------|
| 1.0 | Baseline-only PRD |
| 2.0 | Pro Upgrade (question bank, per-Q scoring, fallback, calibration, voice, proctoring, explainability, anti-gaming, checklist) |
| 2.1 | Appendix A: scorecard / aptitude clarity |
| 3.0 | Sections **11–15**: adversarial engine, voice (Deepgram + Cartesia), v2 APIs, evaluation, migration; **§16** codebase status; header aligns with product board |
| 3.0.1 | **§16** + §13.4/13.5 **implementation notes** (JWT token shape, ElevenLabs-only TTS until Cartesia) |
| 3.0.2 | **§12.8** production voice UX (sanitization, STT echo); **§16** refreshed (30m cap, turnId, Cartesia, filler warm, Whisper primary STT); header STT note; §13.5–13.6 aligned with **`tts.service.ts`** |
| 3.0.3 | **§16** — multi-pass eval, v2 integrity merge, turn timing / `whisperLatencyMs`, v2 per-question rows, `timeExpired`, silence nudge, review-request route + UI, admin analytics & replay; cross-ref **PRD_CANDIDATE Part A v1.3** (now [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.4) |
| 3.0.4 | **PRD v6.8 (Part A):** §3.4.9 end-to-end AI interview doc (questions, relevance, STT/TTS, answer flow); §3.4.3 STT/TTS aligned with **Whisper** + **Cartesia** stack; Expert profile-driven **`v2/start`**. **Part D:** §6 API/frontend lines; **§12.0** verification STT vs **§12.1** Deepgram alternate; §11.6 prefetch note; Part A §12 changelog rows. |
| 3.0.5 | **PRD v6.9 split:** monolithic **`PRD.md`** replaced by index + **`PRD_CANDIDATE.md`**, **`PRD_RECRUITER.md`**, **`PRD_BUSINESS.md`**, **`PRD_AI_INTERVIEW.md`**. Cross-links updated. |

*PRD v3.0.5 — April 2026 | ProvenHire Product Team*
