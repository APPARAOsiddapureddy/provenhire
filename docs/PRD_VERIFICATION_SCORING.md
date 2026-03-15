# PRD: Verification Scoring — Aptitude, DSA & AI Interview

**Purpose:** Define how marks are distributed, calculated, stored, and displayed for the three technical verification stages so implementation and storage can be aligned and corrected if needed.

---

## 1. Aptitude Test

### 1.1 Intended design

| Item | Specification |
|------|----------------|
| **Question set** | 20 questions per attempt, experience-based mix. |
| **Difficulty mix** | Fresher (&lt; 1 yr): 15 easy, 5 medium. 1–3 yr: 10 easy, 5 medium, 5 hard. 5+ yr: 5 easy, 5 medium, 10 hard. |
| **Marks per question** | Easy = 1, Medium = 2, Hard = 2. |
| **Total marks** | Variable: 25 (fresher), 30 (1–3 yr), or 35 (5+ yr). |
| **Pass threshold** | 60% of total marks (e.g. 15/25, 18/30, 21/35). |
| **Time limit** | 30 minutes. |

### 1.2 Calculation

- For each question: compare user’s selected option to `answerKey[qId]`; if correct, add `marksKey[qId]` to earned marks.
- **Score to store:** **Raw earned marks** (e.g. 18), not percentage.
- Pass/fail: `earnedMarks >= passThreshold` (e.g. 18 ≥ 18).

### 1.3 Storage (current)

| Location | What is stored | Type |
|----------|----------------|------|
| `VerificationStage` (stageName = `aptitude_test`) | `score` = **raw earned marks** (e.g. 18) | Int? |
| `AptitudeTestResult` | `score` = same raw earned marks; `answers` = { questions, correct, earnedMarks, totalMarks, timeTakenSeconds?, timeLimitSeconds? } | Int?, Json? |
| `AptitudeSession` | `answerKey`, `marksKey` (for grading); cleared after submit | Json |
| `CandidateSkillVerification` (APTITUDE) | `score` = same raw earned marks (rounded) | Int? |

### 1.4 Consistency check

- **Intent:** One canonical “score” for aptitude is **raw marks** (e.g. 18/25). Percentage (e.g. 72%) is derived as `(score / totalMarks) * 100` where `totalMarks` comes from the session (or from `answers.totalMarks` in AptitudeTestResult).
- **Issue:** APIs that expose “aptitude_score” (e.g. candidate profile, scorecard) sometimes use `VerificationStage.score` directly. That is **raw marks**, whereas DSA and AI interview expose **0–100** scores. So:
  - **Display:** If UI or recruiter view expects a “0–100” aptitude score, it is wrong to show raw marks (e.g. 18) as if it were out of 100.
  - **Recommendation:** Either (a) store and expose **percentage** (0–100) in `VerificationStage.score` for aptitude as well, with raw marks kept in `AptitudeTestResult.answers`, or (b) keep raw marks in `VerificationStage` and always expose both `aptitude_score` (raw) and `aptitude_total_marks` (and optionally `aptitude_percentage`) so clients can show “18/25” or “72%” correctly.

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

### 4.1 Source of truth for “display” scores

`buildTechnicalScorecard()` in `verificationScoring.service.ts` does **not** use `VerificationStage.score` directly for all three. It recomputes:

- **Aptitude:** From `AptitudeTestResult`: `accuracy = (earnedMarks / totalMarks) * 100`, then `aptitudeScore = accuracy*0.7 + speedPercentile*0.2 + consistency*0.1` (0–100). So the scorecard’s `aptitude_score` is **0–100**.
- **DSA:** From `DsaRoundResult`: uses `score` (0–100) and/or per-question scores in `answers` to compute `dsaScore` (test cases, efficiency, code quality). Scorecard’s `dsa_score` is **0–100**.
- **AI:** From `Interview`: uses `totalScore` and `scoreBreakdown`. Scorecard’s `ai_interview_score` is **0–100**.

So for **shortlisting and scorecard API**, all three are on a **0–100** scale.

### 4.2 Final score and gates

- **Final score (0–100):**  
  `finalScore = aptitude_score * 0.25 + dsa_score * 0.35 + ai_interview_score * 0.3 + integrity_score * 0.1`
- **Gate 1:** `aptitude_score >= 55 && dsa_score >= 60 && ai_interview_score >= 60`
- **Gate 2:** `finalScore >= 70`
- **Shortlisted:** Gate 1 and Gate 2 passed, and integrity not overridden (integrity_score ≥ 50).

### 4.3 Where inconsistency can appear

- **Candidate profile / job applications / recruiter views** often use `stageScore("aptitude_test")` from `VerificationStage`, which is **raw marks** (e.g. 18), not 0–100. So:
  - `aptitude_score` in users/jobs APIs = 18 (raw).
  - `dsa_score` = 0–100.
  - `ai_interview_score` = 0–100.

If the UI or recruiter dashboard expects all three to be “out of 100”, aptitude will look wrong (e.g. “18” instead of “72”).

---

## 5. Recommended storage and API contract

### 5.1 Option A (recommended): Normalize aptitude to 0–100 in storage

- **On aptitude submit:** Keep computing raw `earnedMarks` and store in `AptitudeTestResult.score` and `answers.earnedMarks`, `answers.totalMarks`.
- **In `VerificationStage` for `aptitude_test`:** Store **percentage** (0–100):  
  `score = Math.round((earnedMarks / totalMarks) * 100)`  
  so that `VerificationStage.score` is always 0–100 for every stage.
- **CandidateSkillVerification (APTITUDE):** Store the same percentage (0–100).
- **APIs** that return `aptitude_score` from `VerificationStage` or from a single “stage score” then consistently return 0–100 for all three stages.

**Pros:** One scale (0–100) everywhere; no client changes for display.  
**Cons:** Percentage is derived; raw marks remain in `AptitudeTestResult.answers` for audit/debug.

### 5.2 Option B: Keep raw marks for aptitude; expose both

- Leave `VerificationStage.score` for aptitude as **raw marks**.
- In APIs that return candidate scores (e.g. GET candidate profile, applications), return:
  - `aptitude_score`: raw marks (18),
  - `aptitude_total_marks`: 25 (from latest AptitudeTestResult.answers or session),
  - `aptitude_percentage`: 72 (derived),
  and keep `dsa_score` and `ai_interview_score` as 0–100.

**Pros:** No migration; full fidelity (raw + total).  
**Cons:** Clients must handle two formats; more fields.

---

## 6. Summary table (intended vs current)

| Stage | Intended scale | Stored in VerificationStage | Stored in result table | Exposed in profile/APIs |
|-------|----------------|-----------------------------|------------------------|--------------------------|
| **Aptitude** | Raw marks (e.g. 18/25); pass 60% | Raw marks (18) | AptitudeTestResult: raw + answers with totalMarks | Currently raw (18) → looks wrong if UI expects 0–100 |
| **DSA** | 0–100 | 0–100 | DsaRoundResult: 0–100 + per-Q in answers | 0–100 ✓ |
| **AI Interview** | 0–100 | 0–100 | Interview: totalScore 0–100 + scoreBreakdown | 0–100 ✓ |

---

## 7. Non-technical track (for completeness)

- **Non-tech assignment:** Scored by AI; threshold 60/100; stored in `VerificationStage` (non_tech_assignment) as `score` (0–100). Qualified/failed from evaluation result.
- **Human expert interview:** Expert submits evaluation; weighted total ≥ 70 is pass. Stored in `VerificationStage` (human_expert_interview) as `score` (0–100).

---

*This PRD should be used to align storage and APIs so that aptitude, DSA, and AI interview marks are distributed and stored correctly, and to fix any places that assume aptitude is already on a 0–100 scale.*
