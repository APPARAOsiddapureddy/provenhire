# DSA Round Current Flow And Follow-Up MCQ Readiness

This document describes the current DSA question, evaluation, submission, and scoring flow before adding question-specific follow-up MCQs.

## Executive Summary

The current official DSA round is code-only. Questions are loaded from the seeded `DsaQuestion` table, code is evaluated through Judge0 against public and hidden test cases, every run/submit is persisted in `DsaSubmission`, and the final DSA round score is computed as the average test-case pass percentage across the latest official submission for each distinct question.

The new follow-up MCQ flow is not wired yet. The file `src/data/dsaQuestionBank_WithFolloUPS.ts` currently contains a single question-like object with `followUpQuestions`, but it is not exported, not imported by the seed script, not stored in Prisma, and not returned by the DSA question API.

Current scoring is effectively:

```text
questionScore = round(passedTestCases / totalTestCases * 100)
roundScore = round(average(questionScore for latest official submission per question))
```

The proposed scoring change would require changing the persisted official submission/round scoring model to something like:

```text
questionScore = codeScore(70%) + followUpScore(30%)
roundScore = average(questionScore per official question)
```

## Current Question Sources

### Active Question Bank

The active source file is:

```text
src/data/dsaQuestionsBank.ts
```

Important behavior:

- Defines `rawDSAQuestions`.
- Converts each raw question through `convertToDSAQuestion`.
- Exports `getNewDSAQuestions()`.
- Each question becomes a normalized object with:
  - `id`
  - `difficulty`
  - `title`
  - `description`
  - `examples`
  - `constraints`
  - `testCases`
  - `templates`

### Current Follow-Up Bank File

The file:

```text
src/data/dsaQuestionBank_WithFolloUPS.ts
```

Current state:

- Contains one JSON-like question object.
- Includes `followUpQuestions`, each with:
  - `question`
  - `options`
  - `correctAnswer`
  - `explanation`
- It is not exported.
- It is not imported by `server/prisma/seeds/dsaQuestions.seed.ts`.
- It is not part of the current `DsaQuestion` Prisma schema.
- It is not returned by `/api/verification/dsa/questions`.

Important issue: this file is currently a reference/sample format, not an active runtime data source.

## Database Models Involved

Defined in:

```text
server/prisma/schema.prisma
```

### `DsaQuestion`

Stores the question shown to the candidate.

Current fields:

- `id`
- `title`
- `description`
- `difficulty`
- `examples`
- `constraints`
- `starterCode`
- `createdAt`

Current gap: no field for follow-up MCQs.

### `DsaTestCase`

Stores test cases for a question.

Current fields:

- `questionId`
- `input`
- `expected`
- `isHidden`
- `expectedType`
- `timeoutMs`

Public/hidden behavior:

- The seed script marks the first two test cases as public.
- Remaining test cases are hidden.
- Hidden test results return pass/fail/status only, not input or expected output.

### `DsaSubmission`

Stores both non-official test runs and official graded submissions.

Current fields:

- `userId`
- `questionId`
- `language`
- `code`
- `passedCount`
- `totalCount`
- `isOfficial`
- `results`
- `submittedAt`

Behavior:

- `run-tests` creates `isOfficial: false`.
- `submit` creates `isOfficial: true`.
- The latest official submission per question is used for final scoring.

Current gap: no follow-up answer fields, no code score/follow-up score split.

### `DsaRoundResult`

Stores the final DSA round result.

Current fields:

- `userId`
- `score`
- `answers`
- `completedAt`
- `invalidated`

Current behavior:

- `score` is the final DSA round score.
- `answers` stores the frontend-provided answer snapshot with code/language/score.
- Backend recomputes the actual final score from official submissions, not from the frontend score values.

### `VerificationStage`

Stores stage status and displayed stage score.

For DSA:

- `stageName = "dsa_round"`
- `score` is updated with the rounded final DSA score.
- The backend `/dsa` route updates score only.
- The frontend separately calls `/api/verification/stages/update` to mark the stage `completed` or `failed`.

### `CandidateSkillVerification`

Stores skill freshness/validity.

For DSA:

- `skillType = LIVE_CODING`
- Updated after final DSA submission with the rounded DSA score.

## Current Backend Flow

Main route file:

```text
server/src/routes/verification.ts
```

Evaluation service:

```text
server/src/services/dsaEvaluation.ts
```

Judge0 client:

```text
server/src/services/judge0.ts
```

Comparator:

```text
server/src/services/dsaComparator.ts
```

### 1. Fetch Official DSA Questions

Endpoint:

```http
GET /api/verification/dsa/questions
```

Current steps:

1. Calls `ensureDsaRoundActiveForOfficialApis(userId)`.
2. Loads candidate profile.
3. Converts experience years to a tier:
   - `fresher`
   - `mid`
   - `senior`
4. Loads all rows from `DsaQuestion`.
5. Picks questions using tier difficulty slots.
6. Returns selected questions with:
   - `id`
   - `title`
   - `description`
   - `difficulty`
   - `examples`
   - `constraints`
   - `starterCode`
7. Returns round config:
   - `timeLimitMinutes`
   - `passThresholdPercent`
   - `dsaQuestionCount`
   - `experienceTier`
   - `dsaWaiver`

Important current testing note:

- `ensureDsaRoundActiveForOfficialApis` currently has a temporary testing bypass that immediately returns `true`.
- This must be restored before production.

Current gap:

- Selected questions are not persisted as a formal DSA round attempt.
- Refreshing/refetching can select a different random set.
- Final scoring only checks that enough distinct official submissions exist; it does not verify they match a persisted selected question set.

### 2. Run Tests

Endpoint:

```http
POST /api/verification/dsa/run-tests
```

Payload:

```json
{
  "questionId": "DSA_NEW_001",
  "code": "...",
  "language": "java"
}
```

Current steps:

1. Validates payload.
2. Applies DSA run rate limit.
3. Checks DSA gate.
4. Loads all test cases for the question.
5. Calls `evaluateDsaAgainstTestCases`.
6. Persists a `DsaSubmission` with `isOfficial: false`.
7. Returns:
   - `compiledSuccessfully`
   - `passed`
   - `total`
   - `compileError` if any
   - `results`

Important behavior:

- `run-tests` does not lock the question.
- It is used for practice/testing during the round.
- It still persists code and results for audit/context.

### 3. Official Submit For One Question

Endpoint:

```http
POST /api/verification/dsa/submit
```

Payload:

```json
{
  "questionId": "DSA_NEW_001",
  "code": "...",
  "language": "java"
}
```

Current steps:

1. Validates payload.
2. Checks DSA gate.
3. Rejects if an official submission already exists for that user/question.
4. Loads all test cases for the question.
5. Calls `evaluateDsaAgainstTestCases`.
6. Persists a `DsaSubmission` with `isOfficial: true`.
7. Returns:
   - `compiledSuccessfully`
   - `passed`
   - `total`
   - `compileError` if any
   - `results`
   - `submitted: true`

Important behavior:

- The backend currently allows official submission even if not all test cases pass.
- The frontend locks the question after official submission.
- The frontend stores local score as `passed / total * 100`.

Current gap for follow-ups:

- This endpoint finalizes the question immediately.
- For the new flow, official finalization should probably wait until follow-up MCQs are answered.

### 4. Submit Entire DSA Round

Endpoint:

```http
POST /api/verification/dsa
```

Payload currently sent by frontend:

```json
{
  "answers": {
    "DSA_NEW_001": {
      "code": "...",
      "language": "java",
      "score": 100
    }
  }
}
```

Current steps:

1. Validates payload.
2. Loads candidate profile.
3. Handles special invalidation/waiver paths.
4. Loads all official submissions for user.
5. Requires official submissions for enough distinct questions.
6. Computes final score from DB via `computeOfficialDsaRoundScoreFromDb`.
7. Creates `DsaRoundResult`.
8. Updates `VerificationStage.score`.
9. Upserts `CandidateSkillVerification` for `LIVE_CODING`.
10. Publishes result to performance pipeline.
11. Returns:
    - `score`
    - `passThresholdPercent`
    - `passed`

Important behavior:

- The backend does not trust frontend `answers[*].score` for final scoring.
- It stores the frontend answers payload in `DsaRoundResult.answers`.
- Final pass/fail is based on tier threshold.

## Current Judge0 Evaluation Flow

Function:

```text
evaluateDsaAgainstTestCases
```

Current steps:

1. Runs `preflightCompile(code, language)`.
2. If compile fails:
   - returns `compiledSuccessfully: false`
   - marks every test case with compile status
3. Submits all test cases to Judge0 using `submitBatch`.
4. Judge0 receives one submission per test case, sent as a batch.
5. Polls Judge0 until all submissions are complete.
6. Compares Judge0 output with expected output using `compareOutput`.
7. Builds result rows.

Result status mapping includes:

- `CORRECT_ANSWER`
- `WRONG_ANSWER`
- `TLE`
- `MLE`
- `OLE`
- `RUNTIME_ERROR`
- `COMPILE_ERROR`
- `INTERNAL_ERROR`

Hidden test case behavior:

- For hidden tests, response includes only:

```json
{
  "passed": false,
  "status": "WRONG_ANSWER"
}
```

- It does not include hidden input, expected output, or actual output.

## Current Frontend Flow

Main file:

```text
src/pages/verification/stages/DSARoundStage.tsx
```

### Important State

- `questions`: loaded DSA questions.
- `currentIndex`: current question index.
- `codeByLang`: per-question, per-language editor buffers.
- `results`: current visible test results.
- `officialByQuestion`: local record of officially submitted questions.
- `scores`: local per-question score display.
- `submitQuestionConfirmOpen`: confirm dialog for one question.
- `submitConfirmOpen`: confirm dialog for entire round.

### Run Tests Button

Button:

```text
Run test cases
```

Frontend behavior:

1. Sends current code to `/api/verification/dsa/run-tests`.
2. Shows compile errors in console tab.
3. Shows public/hidden test result status.
4. Updates local `scores[questionId]`.
5. Does not lock the editor.

### Submit Solution Button

Button:

```text
Submit solution
```

Frontend behavior:

1. Opens confirmation dialog.
2. Sends current code to `/api/verification/dsa/submit`.
3. Shows final results.
4. Computes local question score:

```text
score = round(passed / total * 100)
```

5. Stores:

```ts
officialByQuestion[questionId] = { code, language, score }
```

6. Locks editor for that question.

Important behavior:

- Current UI does not require all tests to pass before allowing official submit.
- After official submit, the question is considered done regardless of score.

### Next Question Button

Button:

```text
Next question
```

Current behavior:

- Moves to the next question.
- Does not require current question to be officially submitted.
- Does not require all tests to pass.
- The final round submit later requires every selected question to have an official submission.

### Submit Entire Round Button

Button:

```text
Submit entire round
```

Frontend behavior:

1. Checks every selected question exists in `officialByQuestion`.
2. Builds `answers` from local official snapshots.
3. Sends to `/api/verification/dsa`.
4. Backend returns final computed score.
5. Frontend marks stage:
   - `completed` if passed
   - `failed` if not passed

## Current Scoring Mechanics

### Per-Test Result

Each test case is pass/fail after comparing actual output to expected output.

Comparison supports:

- exact relaxed comparison
- numeric tolerance
- array token comparison
- set token comparison

### Per-Question Score

Frontend score:

```text
round(passedCount / totalCount * 100)
```

Backend persisted official submission:

```text
passedCount
totalCount
results
```

Backend does not currently store a separate `questionScore` column.

### Final DSA Round Score

Backend function:

```text
computeOfficialDsaRoundScoreFromDb(userId)
```

Current formula:

```text
for each latest official submission per distinct question:
  questionScore = round(passedCount / totalCount * 100)

roundScore = round(average(questionScore))
```

Example:

```text
Q1: 6/6 = 100
Q2: 3/6 = 50
Q3: 0/6 = 0

roundScore = round((100 + 50 + 0) / 3) = 50
```

### Pass Thresholds

Defined by experience tier:

- Fresher:
  - 2 questions
  - 60 minutes
  - pass threshold 50
- Mid:
  - 3 questions
  - 75 minutes
  - pass threshold 55
- Senior:
  - 3 questions
  - 90 minutes
  - pass threshold 60

### Downstream Score Consumers

The DSA score is used by:

- `DsaRoundResult.score`
- `VerificationStage.score`
- `CandidateSkillVerification` as `LIVE_CODING`
- Skill passport display
- Candidate/recruiter profile score displays
- Performance pipeline signals
- AI skills interview DSA context

Important note:

- `server/src/services/verificationScoring.service.ts` has a separate heuristic DSA signal calculation:

```text
dsaScore = testCaseScore * 0.6 + algorithmEfficiencyScore * 0.25 + codeQualityScore * 0.15
```

This is not the primary DSA round completion score, but it may affect broader scorecards/performance snapshots. If the official DSA scoring changes to 70/30 code/follow-ups, this service should be reviewed to avoid conflicting DSA score semantics.

## What Must Change For Follow-Up MCQs

### Data Model Needs

The system needs a place to store follow-up MCQs.

Possible approaches:

1. Add `followUpQuestions Json?` to `DsaQuestion`.
2. Create normalized tables:
   - `DsaFollowUpQuestion`
   - `DsaFollowUpOption`
   - `DsaFollowUpAnswer`

For production, normalized tables are cleaner for analytics and audits. A JSON field is faster to implement and fits the existing `examples`/`starterCode` style.

The API must not send `correctAnswer` or `explanation` before the user answers.

### Seed Needs

The seed script currently loads:

```text
src/data/dsaQuestionsBank.ts
```

It does not load:

```text
src/data/dsaQuestionBank_WithFolloUPS.ts
```

To use follow-ups, the active question bank format must be extended and the seed schema must validate follow-up questions.

Recommended follow-up source shape:

```ts
followUpQuestions: Array<{
  question: string;
  options: string[];
  correctAnswer: "A" | "B" | "C" | "D";
  explanation?: string;
}>
```

### Backend API Needs

The new flow should distinguish between:

1. Code evaluation passed.
2. Follow-up questions answered.
3. Official question submission finalized.

Current `/dsa/submit` combines code evaluation and final official submission. For the new flow, it should either:

Option A:

- `/dsa/submit-code`
  - evaluates code
  - if all tests pass, returns follow-up questions without answers
- `/dsa/submit-followups`
  - grades MCQs
  - persists final official submission

Option B:

- Keep `/dsa/submit`
  - if code passes, return `followUpRequired: true`
  - do not finalize official submission yet
- Add `/dsa/followups/submit`
  - finalizes the question

Option B preserves more of the current frontend structure.

### Frontend Flow Needs

New desired frontend flow:

1. Candidate writes code.
2. Candidate runs tests as usual.
3. Candidate clicks `Submit solution`.
4. Backend evaluates all test cases.
5. If not all pass:
   - show normal test result failure
   - do not show follow-up popup
   - do not lock question as complete
6. If all pass:
   - show follow-up dialog with 3 MCQs
   - user must answer all MCQs
7. User submits follow-ups.
8. Backend grades follow-ups and finalizes official question submission.
9. Only then unlock/move to next question.

Important frontend state additions:

- `followUpDialogOpen`
- `pendingFollowUpQuestionId`
- `pendingCodeSubmission`
- `followUpAnswersByQuestion`
- `officialByQuestion[questionId]` should include:
  - code score
  - follow-up score
  - final question score

### Scoring Formula Needs

Suggested per-question formula:

```text
codeScore = allTestsPassed ? 70 : round((passed / total) * 70)
followUpScore = round((correctFollowUps / totalFollowUps) * 30)
questionScore = codeScore + followUpScore
```

If follow-ups are shown only after all tests pass, then normal official completion is:

```text
codeScore = 70
followUpScore = 0..30
questionScore = 70..100
```

Product decision needed:

- Should partially passing code be officially submittable?
- Or should official submission be blocked until all test cases pass?

Your stated expected flow says follow-ups appear after code passes all test cases, so the cleanest production rule is:

```text
official question completion requires all code test cases passing + follow-up submission
```

### Persistence Needs

Current `DsaSubmission` can store only `passedCount`, `totalCount`, and raw `results`.

For 70/30 scoring, official submissions should persist enough detail to audit:

- `codeScore`
- `followUpScore`
- `finalQuestionScore`
- `followUpAnswers`
- `followUpCorrectCount`
- `followUpTotalCount`

This can be done with new columns or inside `results` JSON. New columns are better for querying and reporting.

`DsaRoundResult.answers` should also include the final per-question scoring snapshot.

Suggested shape:

```json
{
  "DSA_NEW_001": {
    "code": "...",
    "language": "java",
    "codeScore": 70,
    "followUpScore": 20,
    "score": 90,
    "testCasesPassed": 6,
    "testCasesTotal": 6,
    "followUpsCorrect": 2,
    "followUpsTotal": 3
  }
}
```

## Key Risks Before Implementation

1. The follow-up bank file is not active.
2. The current Prisma schema cannot store follow-up questions directly.
3. Correct answers must not be sent to the frontend before submission.
4. Current official submit locks a question immediately; the new flow needs a pending follow-up state.
5. Current final scoring is code-only and must be changed centrally in `computeOfficialDsaRoundScoreFromDb`.
6. Current selected question set is not persisted, so final scoring can accept any enough distinct official submissions.
7. Current testing bypass in `ensureDsaRoundActiveForOfficialApis` must be removed before production.
8. Broader performance scoring has a separate heuristic DSA score formula that may need alignment.

## Files Likely Involved In The Follow-Up Implementation

Backend:

- `server/prisma/schema.prisma`
  - Add follow-up question storage and/or follow-up answer storage.
- `server/prisma/seeds/dsaQuestions.seed.ts`
  - Validate and seed follow-up MCQs.
- `server/src/routes/verification.ts`
  - Return sanitized follow-ups.
  - Add/adjust submit endpoints.
  - Compute 70/30 final question and round score.
- `server/src/services/dsaEvaluation.ts`
  - May remain mostly code-evaluation-only.
  - Could add a helper type for code score.
- `server/src/services/verificationScoring.service.ts`
  - Review DSA score formula alignment.
- `server/src/services/interview/aiSkillsOrchestrator.ts`
  - Optionally include follow-up results in DSA context.

Frontend:

- `src/pages/verification/stages/DSARoundStage.tsx`
  - Add follow-up dialog.
  - Block next/final completion until follow-ups are answered.
  - Show code/follow-up/final score split.
- `src/data/dsaQuestionsBank.ts`
  - Add follow-up questions to the active bank, or replace with a new merged bank.
- `src/data/dsaQuestionBank_WithFolloUPS.ts`
  - Convert from sample object into active exported data, or migrate its content into `dsaQuestionsBank.ts`.
- `src/components/SkillPassport.tsx`
  - Probably no immediate change unless we want to show score breakdown.

## Recommended Implementation Direction

For production quality, the cleanest flow is:

1. Seed follow-ups into DB with correct answers stored server-side only.
2. Fetch DSA questions without follow-up answers.
3. Let users run tests freely.
4. On `Submit solution`, evaluate all test cases.
5. If code fails, return results and do not finalize.
6. If code passes all cases, return sanitized follow-up MCQs.
7. Show a modal dialog with exactly 3 MCQs.
8. Submit MCQ answers to a backend endpoint.
9. Backend grades MCQs, persists official submission, and returns:
   - `codeScore`
   - `followUpScore`
   - `finalQuestionScore`
10. Final round score averages the finalized question scores.

This keeps the anti-copying check meaningful: copied code can pass Judge0, but the candidate still needs to understand the solution to answer the follow-ups.
