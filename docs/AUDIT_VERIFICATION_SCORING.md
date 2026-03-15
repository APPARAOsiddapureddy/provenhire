# Verification Scoring System — Full Audit Report

**Scope:** Aptitude Test, DSA Round, AI Expert Interview — calculation, storage, API exposure, scorecard, and gate logic.  
**No code was modified; analysis only.**

---

## 1. Score Calculation

### 1.1 Aptitude Test

| Check | Status | Details |
|-------|--------|---------|
| Difficulty marks (easy=1, medium=2, hard=2) | ✅ | `server/src/data/aptitude-loader.ts`: `APTITUDE_MARKS`, `marksKey[qId]` used correctly. |
| Earned marks vs answerKey | ✅ | `server/src/routes/verification.ts` POST `/aptitude`: loops over answers, compares to `answerKey`, adds `marksKey[qId]` on match. Correct. |
| Total marks / pass threshold | ✅ | `createAptitudeSession()`: `totalMarks` = sum of marksKey; `passThreshold = Math.ceil(totalMarks * 0.6)`. Correct. |
| Score stored | ⚠️ | Backend stores **raw earned marks** (e.g. 18) in `VerificationStage`, `AptitudeTestResult`, and `CandidateSkillVerification`. Design is consistent but scale differs from DSA/AI (see §3). |
| Comment accuracy | ❌ | **Bug.** In `verification.ts` line 214 the comment says "Raw marks out of 100" — total marks are 25/30/35, not 100. Misleading. |

**Verdict:** Calculation logic is correct. Stored value is intentionally raw marks; the only correction needed is the comment and the scale inconsistency when exposing scores (see §3).

---

### 1.2 DSA Round

| Check | Status | Details |
|-------|--------|---------|
| Per-problem score | ✅ | Frontend `DSARoundStage.tsx`: `score = (passed / total) * 100` per problem. Correct. |
| Final score | ✅ | `totalScore = average(scores[Q1], scores[Q2], scores[Q3])`, then `finalScore = Math.min(100, Math.max(0, totalScore))`. Correct. |
| 0–100 scale | ✅ | Sent to backend as 0–100; backend stores `Math.round(dsaScore)`. Correct. |

**Verdict:** DSA calculation and scale are correct end-to-end.

---

### 1.3 AI Expert Interview

| Check | Status | Details |
|-------|--------|---------|
| computeScore() weights | ✅ | `server/src/routes/interview.ts`: `total = concept*0.4 + reasoning*0.3 + communication*0.2 + confidence*0.1`. Weights sum to 1.0. Correct. |
| Concept / reasoning / communication derivation | ✅ | concept from `concept_score` or `(technical_accuracy + depth_of_knowledge)/2 * 10`; reasoning from `reasoning_score` or `problem_solving*10`; communication from `communication_score` or `communication_clarity*10`; confidence from score or High/Medium/Low. Correct. |
| Clamp 0–100 | ⚠️ | **Gap.** `total` is not clamped: `total = Math.round(...)`. If the AI returns out-of-range values (e.g. > 10), `total` could exceed 100 or go negative. Defensive clamp recommended. |

**Verdict:** Formula is correct; adding a clamp to 0–100 would make the pipeline robust to bad AI output.

---

## 2. Database Storage

### 2.1 Where scores are written

| Stage | VerificationStage | Result table | CandidateSkillVerification |
|-------|-------------------|--------------|----------------------------|
| Aptitude | ✅ Raw marks (POST `/aptitude` + frontend `stages/update`) | ✅ `AptitudeTestResult.score` raw, `answers`: earnedMarks, totalMarks | ✅ Raw marks |
| DSA | ✅ 0–100 (POST `/dsa` + frontend `stages/update`) | ✅ `DsaRoundResult.score` 0–100, `answers` per-problem | ✅ 0–100 |
| AI Interview | ✅ 0–100 (in `interview.ts` respond) | ✅ `Interview.totalScore` 0–100, `scoreBreakdown` | ✅ 0–100 |

### 2.2 Overwrites and consistency

- **Aptitude:** POST `/aptitude` updates `VerificationStage.score` when a row exists; frontend then calls `stages/update` with the same raw score and status. No conflicting overwrite; both write raw marks.
- **DSA:** POST `/dsa` updates `VerificationStage.score` only when `existingStage` exists; frontend then calls `stages/update` with the same 0–100 score. Consistent.
- **AI:** Only the interview route writes `VerificationStage` and `Interview`; single source of truth. Consistent.

### 2.3 Scale consistency

- **VerificationStage:** Aptitude = **raw marks** (e.g. 18). DSA and expert_interview = **0–100**. So the same `score` column has two different semantics.
- **CandidateSkillVerification:** APTITUDE = raw marks; LIVE_CODING and INTERVIEW = 0–100. Same inconsistency.

### 2.4 Edge case: DSA when no stage row exists

- In POST `/dsa`, when `existingStage` is null, the handler does **not** create a `VerificationStage` row; it only writes `DsaRoundResult`. The frontend then calls `stages/update`, which uses `updateMany` and does **not** create rows. So if the `dsa_round` stage was never created (e.g. stages/bulk not called), the DSA score would exist only in `DsaRoundResult`, not in `VerificationStage`. In the current flow, stages are created via bulk when loading verification, so this is an edge case; worth documenting or fixing by creating the stage in POST `/dsa` when missing (similar to expert_interview in `interview.ts`).

---

## 3. API Responses (Score Exposure)

All of the following use `VerificationStage` only (via a `stageScore(stageName)` helper) and do **not** use the scorecard service:

| API | File | aptitude_score | dsa_score | ai_interview_score |
|-----|------|-----------------|-----------|--------------------|
| GET `/api/users/me/candidate-profile` | users.ts | VerificationStage (raw) | VerificationStage (0–100) | VerificationStage (0–100) |
| GET `/api/users/candidates` | users.ts | VerificationStage (raw) | VerificationStage (0–100) | VerificationStage (0–100) |
| GET `/api/users/candidates/:profileId` | users.ts | VerificationStage (raw) | VerificationStage (0–100) | VerificationStage (0–100) |
| GET `/api/jobs/:id/applicants` | jobs.ts | VerificationStage (raw) | VerificationStage (0–100) | VerificationStage (0–100) |

**Bug — Scale inconsistency:**  
`aptitude_score` is **raw marks** (e.g. 18), while `dsa_score` and `ai_interview_score` are **0–100**. Any UI or report that treats all three as “out of 100” will show aptitude incorrectly (e.g. 18 instead of 72%).

**Bug — hiring_readiness in jobs.ts:**  
`hiring_readiness = ((aptitude ?? 0) + (dsa ?? 0) + (ai ?? assign ?? 0) + integrityScore) / 4`. Here `aptitude` is raw marks (e.g. 18). So a candidate with 18/25 (72%), 80 DSA, 80 AI, 90 integrity gets `(18 + 80 + 80 + 90) / 4 = 67` instead of `(72 + 80 + 80 + 90) / 4 = 80.5`. Hiring readiness is systematically skewed when aptitude is treated as if it were 0–100.

---

## 4. Scorecard Service (`verificationScoring.service.ts`)

### 4.1 Data source

- **Aptitude:** Reads `AptitudeTestResult` (latest): `score` and `answers`. Does **not** use `VerificationStage`.
- **DSA:** Reads `DsaRoundResult`: `score` and `answers`.
- **AI:** Reads `Interview`: `totalScore` and `scoreBreakdown`.

### 4.2 Aptitude derivation

- `totalMarks = answers.totalMarks || 100` (fallback 100).
- `earnedMarks = answers.earnedMarks ?? score`.
- `accuracy = (earnedMarks / totalMarks) * 100`.
- `aptitudeScore = accuracy*0.7 + speedPercentile*0.2 + consistencyScore*0.1` (0–100).

**Issue:** If `answers` is missing or doesn’t have `totalMarks`, fallback 100 is used. Then for a stored raw score of 18, accuracy becomes 18/100 = 18% instead of e.g. 18/25 = 72%. So for old or malformed records the scorecard understates aptitude.

### 4.3 DSA derivation

- Uses `DsaRoundResult.score` (0–100) and/or per-question scores in `answers`.  
- `dsaScore = testCaseScore*0.6 + algorithmEfficiency*0.25 + codeQuality*0.15`.  
- Correct and consistent with 0–100.

### 4.4 AI interview usage

- Uses `Interview.totalScore` and `scoreBreakdown`; recomputes with same weights (concept 0.4, reasoning 0.3, communication 0.2, confidence 0.1).  
- Correct.

### 4.5 Final score formula

- `finalScore = aptitude_score*0.25 + dsa_score*0.35 + ai_interview_score*0.30 + integrity_score*0.10`.  
- Weights sum to 1.0. Implementation matches this. ✅

---

## 5. Gate Logic

- **Gate 1:** `aptitude_score >= 55 && dsa_score >= 60 && ai_interview_score >= 60`.  
  Implemented in `buildTechnicalScorecard()`; all three scores are 0–100 there. ✅  
- **Gate 2:** `finalScore >= 70`.  
  Implemented correctly. ✅  
- **Shortlisted:** `gate1Passed && gate2Passed && !integrityOverride` (integrity_score ≥ 50). ✅  

Gate logic uses the scorecard’s 0–100 scores, so shortlisting is correct. The only issues are in profile/applicant APIs and hiring_readiness, which use raw aptitude from `VerificationStage`.

---

## 6. Other Inconsistencies

### 6.1 GET `/api/verification/aptitude/latest`

- Returns `total_marks: answers?.totalMarks ?? 20`.  
- Actual totals are 25, 30, or 35. Fallback **20** is wrong; if `answers` is missing, the client could show e.g. 18/20 instead of 18/25.

### 6.2 extractAptitudeSignals fallback

- `totalMarks = extractNumeric(..., 100) || 100` → 100 when missing.  
- With raw `score` 18, that yields 18% instead of the correct percentage. Same as above: wrong for missing or legacy data.

---

## 7. Summary of Bugs and Recommendations

### 7.1 Bugs

| # | Severity | Description | Location |
|---|----------|-------------|----------|
| 1 | High | **Aptitude shown as raw marks (e.g. 18) in profile/APIs** while DSA and AI are 0–100; UI/reports that assume “out of 100” show wrong aptitude. | users.ts (me/candidate-profile, candidates, candidates/:id), jobs.ts (applicants) |
| 2 | High | **hiring_readiness** treats aptitude as 0–100; with raw marks it is skewed (e.g. 18 instead of 72). | jobs.ts ~279–281 |
| 3 | Medium | **Comment** "Raw marks out of 100" is wrong (total is 25/30/35). | verification.ts line 214 |
| 4 | Medium | **GET /aptitude/latest** uses `totalMarks` fallback 20; should be 25 or derive from session/answers. | verification.ts line 277 |
| 5 | Medium | **extractAptitudeSignals** uses totalMarks fallback 100; understates aptitude when answers/totalMarks missing. | verificationScoring.service.ts line 82 |
| 6 | Low | **computeScore()** does not clamp AI interview total to [0, 100]; could go out of range on bad AI output. | interview.ts computeScore |
| 7 | Low | **DSA:** If `VerificationStage` for dsa_round doesn’t exist, POST `/dsa` doesn’t create it; score lives only in DsaRoundResult. | verification.ts POST /dsa |

### 7.2 Recommended fixes (no code changes in this audit)

1. **Normalize aptitude to 0–100 when storing** (Option A from PRD):  
   On aptitude submit, store in `VerificationStage` and `CandidateSkillVerification`  
   `score = Math.round((earnedMarks / totalMarks) * 100)`.  
   Keep raw marks (and totalMarks) in `AptitudeTestResult.answers` for audit. Then all profile/APIs and hiring_readiness stay as-is and become correct.

2. **Or keep raw marks and fix exposure:**  
   In users and jobs routes, when returning candidate scores, compute aptitude percentage from latest `AptitudeTestResult` (earnedMarks/totalMarks)*100 when available; otherwise leave as null or document that it’s raw. For hiring_readiness, use that percentage for aptitude instead of raw marks.

3. **Fix comment** in verification.ts: e.g. "Raw earned marks (total varies 25–35 by experience). Pass threshold 60%."

4. **GET /aptitude/latest:** Prefer `answers?.totalMarks` and use a sensible fallback (e.g. 25) or omit total_marks when unknown.

5. **extractAptitudeSignals:** When `answers.totalMarks` is missing, avoid using 100; e.g. derive from sum of marksKey if available, or mark aptitude as unreliable instead of computing a wrong percentage.

6. **computeScore:** Add `total = Math.min(100, Math.max(0, total))` before storing and returning.

7. **POST /dsa:** If `existingStage` is null, create a `VerificationStage` row for dsa_round with the submitted score (and e.g. status from frontend or a default) so the score is never only in DsaRoundResult.

---

## 8. Formula and scale reference

| Item | Formula / scale | Implemented correctly |
|------|------------------|------------------------|
| Aptitude earned marks | Sum of marksKey[qId] for correct answers | ✅ |
| Aptitude pass | earnedMarks >= ceil(totalMarks * 0.6) | ✅ (frontend uses passThreshold from API) |
| DSA final | avg(problem scores), 0–100 | ✅ |
| AI total | 0.4*concept + 0.3*reasoning + 0.2*comm + 0.1*confidence | ✅ |
| Scorecard final | 0.25*apt + 0.35*dsa + 0.30*ai + 0.10*integrity | ✅ |
| Gate 1 | apt≥55, dsa≥60, ai≥60 | ✅ |
| Gate 2 | finalScore≥70 | ✅ |

---

*End of audit. No code was modified.*
