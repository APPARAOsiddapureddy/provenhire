# PRD: Verification Scoring — Aptitude, DSA & AI Interview

**Version:** 2.0  
**Last updated:** April 2026  
**Purpose:** Define how marks are calculated, stored, and shown for the three technical verification stages. This revision matches the **current** frontend and backend (post–aptitude UI and API alignment).

**Team index:** [docs/README.md](README.md) · **Main PRD:** [PRD.md](PRD.md)

---

## 1. Aptitude Test

### 1.1 Intended design

| Item | Specification |
|------|----------------|
| **Question set** | 20 MCQs per attempt, experience-based mix (exactly 2 verbal, remainder quant/logical — see `server/src/data/aptitude-loader.ts`). |
| **Difficulty mix** | Fresher (&lt; 1 yr): 15 easy, 5 medium. 1–3 yr: 10 easy, 5 medium, 5 hard. 5+ yr: 5 easy, 5 medium, 10 hard. |
| **Marks per question** | Easy = 1, Medium = 2, Hard = 2. |
| **Total marks** | Variable: **25** (fresher), **30** (1–3 yr), or **35** (5+ yr). |
| **Pass threshold** | **60%** of total marks (e.g. 15/25, 18/30, 21/35). |
| **Time limit** | **30 minutes** from server-issued start; submit window enforced server-side using `AptitudeSession.testStartedAt` plus **120 seconds** grace (see `POST /api/verification/aptitude`). |

### 1.2 Calculation

- For each question: compare the submit payload to `answerKey[qId]`; if correct, add `marksKey[qId]` to **earned marks**.
- **Pass/fail:** `earnedMarks >= ceil(totalMarks * 0.6)` (same threshold the UI uses via `passThreshold` from `GET /api/verification/aptitude/questions`).
- **`POST /api/verification/aptitude` response:** `score` = **raw earned marks** (e.g. 18). Optional `breakdown` includes `correct`, `incorrect`, `skipped`, `earnedMarks`, `totalMarks`.

### 1.3 Storage (**current implementation** — dual representation)

| Location | What is stored | Type / scale |
|----------|----------------|--------------|
| **`AptitudeTestResult.score`** | **Raw earned marks** (e.g. 18) | Int? |
| **`AptitudeTestResult.answers`** | JSON: `questions`, `correct`, `incorrect`, `skipped`, **`earnedMarks`**, **`totalMarks`**, optional timing fields | Json? |
| **`VerificationStage`** (`stageName = aptitude_test`) | **`score` = rounded percentage 0–100** — `Math.round((earnedMarks / totalMarks) * 100)` when `totalMarks > 0` | Int? |
| **`CandidateSkillVerification`** (APTITUDE) | Same **0–100 percentage** as the stage row (via `upsertSkillVerification`) | Int? |
| **`AptitudeSession`** (until submit or expiry) | `questions`, `answerKey`, `marksKey`, optional `draft`, **`testStartedAt`**, `expiresAt` | Json / DateTime |

**Why two scales:** `AptitudeTestResult` keeps **audit-grade raw marks** and totals. **`VerificationStage` and skill verification** use **0–100** so aptitude aligns with DSA and AI interview in dashboards, recruiter views, and hiring-readiness style rollups without showing “18” as if it were “18 out of 100.”

### 1.4 Frontend display

- **`AptitudeTestStage.tsx`** shows the candidate **percentage** (e.g. “Your score: **72%**”) and compares pass using **raw** `score` vs **raw** `passThreshold` from the session API.
- **`POST .../stages/update`** after submit sends **status only** (no duplicate score in payload); the canonical percent for the stage row is already written inside **`POST /api/verification/aptitude`**.

### 1.5 APIs and profile normalization

- **`GET /api/verification/aptitude/latest`** — Builds a display object from the latest result: when `answers.totalMarks` exists, returns earned marks, total marks, and **percentage**; legacy rows without marks may treat stored `score` as 0–100.
- **`getAptitudeScoreZeroToHundred` / `getAptitudeScoresZeroToHundredBatch`** (`server/src/utils/aptitudeScore.ts`) — Used by **users** and **jobs** routes so **`aptitude_score` in candidate profile, search, and applicants** is consistently **0–100**, derived from `AptitudeTestResult.answers` when possible.

---

## 2. DSA Round

### 2.1 Intended design

| Item | Specification |
|------|----------------|
| **Number of problems** | 3. |
| **Scoring per problem** | Each problem: run test cases; score for that problem = percentage of test cases passed (0–100). |
| **Round score** | Average of the 3 problem scores, rounded, clamped 0–100. |
| **Pass threshold** | 60% (60/100) to proceed to next stage (configurable as ELIGIBILITY_THRESHOLD on frontend). |

### 2.2 Calculation (frontend)

- Per problem: `score = (passed / total) * 100` (rounded).
- **Final score:** `finalScore = average(scores[Q1], scores[Q2], scores[Q3])`, rounded, clamped to [0, 100].
- This 0–100 value is sent to the backend.

### 2.3 Storage (current)

| Location | What is stored | Type |
|----------|----------------|------|
| `VerificationStage` (stageName = `dsa_round`) | `score` = **0–100** (average of 3 problem percentages) | Int? |
| `DsaRoundResult` | `score` = same 0–100; `answers` = { [questionId]: { code, language, score } } where score is per-problem 0–100 | Int?, Json? |
| `CandidateSkillVerification` (LIVE_CODING) | `score` = same 0–100 (rounded) | Int? |

### 2.4 Consistency check

- **Intent:** DSA score is always a **0–100** percentage. Stored and exposed consistently.
- **Note:** `GET /dsa/latest` returns `problems_solved` as `Math.round((score/100) * 3)` (derived). That is an approximation; exact “problems solved” could be derived from `answers` if needed.

---

## 3. AI Expert Interview

### 3.1 Intended design

| Item | Specification |
|------|----------------|
| **Format** | Multiple questions (7 technical + 4 behavioral); candidate answers in text (and optionally audio). |
| **Evaluation** | LLM evaluates transcript; returns rubric scores (0–10 or 0–100 per dimension). |
| **Dimensions** | concept (technical + depth), reasoning (problem_solving), communication, confidence. |
| **Final score** | Single 0–100 score used for pass/fail and shortlisting. |

### 3.2 Calculation (backend)

From `evaluateInterview()` (AI service) the model returns (among others):

- `technical_accuracy`, `depth_of_knowledge`, `problem_solving`, `communication_clarity` (0–10 each), and/or  
- `concept_score`, `reasoning_score`, `communication_score`, `confidence_score` (0–100 each).

`computeScore()` in `server/src/routes/interview.ts`:

- **Concept** = `concept_score` if present, else `((technical_accuracy + depth_of_knowledge) / 2) * 10` → 0–100.
- **Reasoning** = `reasoning_score` if present, else `problem_solving * 10` → 0–100.
- **Communication** = `communication_score` if present, else `communication_clarity * 10` → 0–100.
- **Confidence** = `confidence_score` if present, else High=85, Medium=70, Low=50.

**Weighted total (0–100):**

- `total = concept * 0.4 + reasoning * 0.3 + communication * 0.2 + confidence * 0.1`

This `total` is stored and used for stage completion and shortlisting.

### 3.3 Storage (current)

| Location | What is stored | Type |
|----------|----------------|------|
| `VerificationStage` (stageName = `expert_interview`) | `score` = **0–100** (same as `total` from computeScore) | Int? |
| `Interview` | `totalScore` = same 0–100; `scoreBreakdown` = full rubric (technical_accuracy, depth_of_knowledge, concept_score, etc.); `badgeLevel` (e.g. Silver/Gold/Elite Verified) | Int?, Json? |
| `CandidateSkillVerification` (INTERVIEW) | `score` = same 0–100 (rounded) | Int? |

### 3.4 Badge levels (from computeScore)

- total ≥ 90 → Elite Verified  
- total ≥ 75 → Gold Verified  
- total ≥ 60 → Silver Verified  
- &lt; 60 → Not Verified  

### 3.5 Consistency check

- **Intent:** AI interview score is **0–100** everywhere. Stored and exposed consistently.

---

## 4. How scores are used together (technical scorecard & shortlisting)

### 4.1 Source of truth for scorecard (0–100 sub-scores)

`buildTechnicalScorecard()` in `verificationScoring.service.ts` recomputes:

- **Aptitude:** From latest **`AptitudeTestResult`**: `accuracy = (earnedMarks / totalMarks) * 100` (with sensible fallbacks), then `aptitudeScore = accuracy*0.7 + speedPercentile*0.2 + consistency*0.1` → **0–100**.
- **DSA:** From `DsaRoundResult` → **0–100**.
- **AI:** From `Interview` → **0–100**.

So the **scorecard** always uses **0–100** aptitude math derived from the **result row**, not the raw stage integer alone.

### 4.2 Final score and gates

- **Final score (0–100)** — weighted blend of the three stage sub-scores only (integrity is tracked separately from **proctoring violation counts** / scorecard deductions):  
  `finalScore = aptitude_score * 0.25 + dsa_score * 0.35 + ai_interview_score * 0.40`  
  (see `buildTechnicalScorecard()` in `verificationScoring.service.ts`.)
- **Gate 1:** `aptitude_score >= 55 && dsa_score >= 60 && ai_interview_score >= 60`
- **Gate 2:** `finalScore >= 65` (shortlist threshold aligned with PRD § Stage 4→5)
- **Shortlisted:** Gate 1 and Gate 2 passed, no integrity override (e.g. integrity score &lt; 50), and interview not on integrity hold — exact rules in code.

### 4.3 Profile, jobs, and recruiter views

- **`VerificationStage.score`** for aptitude is **already 0–100** after submit.
- **APIs** additionally run **`getAptitudeScoreZeroToHundred`** so lists and edge cases (legacy rows) still expose a **percentage** consistent with **`AptitudeTestResult.answers`** when available.
- **No longer a product gap:** Showing “18” as the only aptitude number on par with DSA/AI was the old inconsistency; UI copy and stage/skill storage now emphasize **percent**, with raw marks retained in **`AptitudeTestResult`**.

---

## 5. Historical note: API contract evolution

**Previous gap:** Some surfaces treated `VerificationStage.score` for aptitude as comparable to DSA (0–100) while it stored **raw marks**.

**Current approach (implemented):**

- Keep **raw earned marks** in **`AptitudeTestResult.score`** + **`answers.earnedMarks` / `answers.totalMarks`**.
- Write **rounded percentage 0–100** into **`VerificationStage`** and **`CandidateSkillVerification`** on submit.
- Normalize display in **users/jobs** via **`aptitudeScore.ts`**.

**Alternative not used:** Expose separate fields `aptitude_score_raw` and `aptitude_total_marks` everywhere — unnecessary given the above.

---

## 6. Summary table (as implemented)

| Stage | Grading unit | `VerificationStage.score` | Result table | Candidate-facing UI / list APIs |
|-------|----------------|---------------------------|--------------|----------------------------------|
| **Aptitude** | Weighted marks → **60% to pass** | **0–100 %** (rounded) | `AptitudeTestResult`: **raw marks** + **`answers`** | **%** (toasts, results screen); APIs **0–100** via stage + helpers |
| **DSA** | 0–100 | 0–100 | `DsaRoundResult`: 0–100 | 0–100 |
| **AI Interview** | 0–100 | 0–100 | `Interview`: 0–100 | 0–100 |

---

## 7. Non-technical track (for completeness)

- **Non-tech assignment:** Scored by AI; threshold 60/100; stored in `VerificationStage` (non_tech_assignment) as `score` (0–100). Qualified/failed from evaluation result.
- **Human expert interview:** Expert submits evaluation; weighted total ≥ 70 is pass. Stored in `VerificationStage` (human_expert_interview) as `score` (0–100).

---

*Use this PRD together with `docs/PRD.md` and `docs/VERIFICATION_IDEOLOGY.md`. Implementation references: `server/src/routes/verification.ts` (aptitude), `server/src/data/aptitude-loader.ts`, `server/src/data/aptitude-session-db.ts`, `server/src/utils/aptitudeScore.ts`, `src/pages/verification/stages/AptitudeTestStage.tsx`.*
