# PRD: AI Expert Interview Round

**Status:** **Pro Upgrade implemented in codebase** (Mar 2026). Deploy checklist: apply Prisma migration `20260316150000_ai_interview_pro_upgrade`, run `cd server && npm run seed:interview-bank` if using `QUESTION_BANK_SOURCE=db`, set server env `QUESTION_BANK_SOURCE` (`static` default).  
**Scope:** Verification stage `expert_interview` (AI interview), not DSA or human expert interviews.  
**Model:** Gemini 2.5 Flash via `@google/genai`  
**Weight in final technical score:** 40% (see `server/src/services/verificationScoring.service.ts`)

This document has two layers:

1. **Appendix A — Current implementation** (what runs in production today).
2. **Sections 1–10 — Pro Upgrade** (governance, scoring, fallbacks, calibration, voice, proctoring, explainability, anti-gaming, checklist, dependencies). Aligned with *ProvenHire AI Interview Pro Upgrade Context*.

---

# Pro Upgrade (target specification)

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

### 6.1 Risk point table (interview completion)

Compute **`riskScore`** (0–100) from proctoring events **for this interview session**. Persist on `Interview`: `riskScore Float?`, `integrityFlag String?`.

| Event | Points |
|-------|--------|
| Tab switch 1st | +5 |
| Tab switch 2nd | +10 |
| Tab switch 3+ | +20 each |
| Fullscreen exit 1st | +5 |
| Fullscreen exit 2+ | +15 each |
| Face not detected &gt; 10s | +10 |
| Face not detected &gt; 30s | +20 |
| Multiple faces | +25 |
| Copy-paste 1 instance | +15 |
| Copy-paste 3+ instances | +40 |
| DevTools opened | +30 |
| Answer length &gt; 2000 chars (anti-gaming) | +20 |

### 6.2 Integrity bands

| `riskScore` | Action |
|-------------|--------|
| **0–20** | Clean — normal flow |
| **21–40** | `integrityFlag = review_recommended` — soft flag; yellow on admin; **shortlist not blocked** |
| **41–60** | `integrityFlag = review_required` — **shortlist blocked** until admin clears |
| **&gt; 60** | `integrityFlag = integrity_violation` — interview excluded from scorecard; `buildTechnicalScorecard()` uses **`ai_interview_score = 0`**; admin may override |

### 6.3 Admin override + audit log

New table **`ProctoringReviewLog`**:

- `id`, `interviewId`, `adminId`, `action` (e.g. approve / reject), `note` (required), `createdAt`

Admin UI shows: event timeline, counts, computed `riskScore`, current `integrityFlag`, **Override** with mandatory note — every action appends a log row.

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
| Too long | `length > 2000` → flag + **+20** risk (§6) |
| Too short | Technical Q, `length < 20` → **+5** risk |
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
3. Update `InterviewMessage.flagAntiGaming` / `flagReason` and increment `Interview.riskScore` per §6.

---

## 9) Implementation checklist (24 tasks)

Paths match **this repo** (PDF used `client/` — here `src/`).

| # | Task | File / location |
|---|------|-----------------|
| 1 | Add `InterviewQuestionBank` model | `server/prisma/schema.prisma` |
| 2 | Add `InterviewQuestionResult` model | `server/prisma/schema.prisma` |
| 3 | Extend `InterviewMessage` (transcription + anti-gaming fields) | `server/prisma/schema.prisma` |
| 4 | Extend `Interview` (experience, review, risk, integrity flags) | `server/prisma/schema.prisma` |
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
| Prisma | New models + fields; single migration |
| Gemini | Prompt/output contract only; same SDK |
| `QUESTION_BANK_SOURCE` | Server env: `static` default, `db` after seed verified |
| Admin auth | Existing `requireAdmin` on new admin routes |
| Email | For `pending_review` resolution + review request outcomes (use existing mail integration) |
| **New npm packages** | **None required** — Express + Prisma + React + current Gemini client |

---

# Appendix A — Current implementation (baseline)

*As of last doc sync; verify in code before relying on line-level detail.*

- **Questions:** Static `ROLE_PLANS` + `HR_QUESTIONS` in `server/src/routes/interview.ts`; 7 technical + 4 HR; keyword `buildQuestionPlan(role)`.
- **APIs:** `POST /api/interview/start`, `POST /api/interview/respond`, `GET /api/interview/latest`, `GET /api/interview/:id/result`.
- **Evaluator:** `evaluateInterview()` in `server/src/services/ai.service.ts` — aggregate JSON, optional `per_question_scores` **not** in baseline.
- **Aggregate score:** `computeScore()` in `interview.ts` — weighted blend of concept/reasoning/communication/confidence; badges at 90 / 75 / 60.
- **Persistence:** `Interview`, `InterviewMessage`, `VerificationStage`, `CandidateSkillVerification`; proctoring events via existing hooks in `ExpertInterviewStage.tsx`.
- **Final technical score:** `buildTechnicalScorecard()` — `aptitude*0.25 + dsa*0.35 + ai_interview*0.40`.

The **Pro Upgrade** sections above supersede Appendix A for each topic once shipped.

---

## Document history

| Version | Change |
|---------|--------|
| 1.0 | Baseline-only PRD |
| 2.0 | Merged **Pro Upgrade** spec (question bank, per-Q scoring, fallback, calibration, voice, proctoring bands, explainability, anti-gaming, 24-task checklist, dependencies) |
