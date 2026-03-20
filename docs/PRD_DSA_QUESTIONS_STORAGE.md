# PRD: DSA Questions Storage & APIs

**Version:** 1.0  
**Last updated:** 2026-03-20  
**Author:** ProvenHire Engineering

---

## 1. Purpose
This PRD defines how ProvenHire stores DSA questions and test cases in the database, how the seed process populates them, and how authenticated backend APIs expose questions / run tests without exposing hidden test inputs or expected outputs.

---

## 2. Scope

In scope:
- Prisma data model for DSA questions and test cases
- Relationship/structure between question and test cases
- Seed script behavior (idempotency + hidden test marking)
- Backend API contracts:
  - `GET /api/verification/dsa/questions`
  - `GET /api/verification/dsa/practice-questions`
  - `POST /api/verification/dsa/run-tests`
- Hidden test redaction rules

Out of scope:
- Frontend UI rendering details (only API response shapes needed for frontend integration)
- Judge0 configuration and overall verification flow (only what is required for DSA endpoints)

---

## 3. Data Storage Model (Prisma)

### 3.1 Entities

#### `DsaQuestion`
Represents a single DSA problem statement and its starter code/templates.

**Prisma model:**
- `id` (String, `@default(cuid())`, primary key)
- `title` (String)
- `description` (String)
- `difficulty` (String)  
  - Expected values: `"Easy" | "Medium" | "Hard"` (selection logic filters by these exact strings)
- `examples` (Json)  
  - A JSON payload returned to the frontend as “examples” for UI display
  - Seed logic derives this from source question data (explicit examples if present; otherwise derived from the first test case)
- `constraints` (String[])  
  - Used for prompt/UI guidance (frontend displays constraints, backend stores it)
- `starterCode` (Json)  
  - Language-keyed starter code templates (e.g. `{ javascript: "...", python: "..." }`)
- `createdAt` (DateTime, default `now()`)

#### `DsaTestCase`
Represents the input/expected output pairs used to evaluate submissions.

**Prisma model:**
- `id` (String, `@default(cuid())`, primary key)
- `questionId` (String)  
  - Foreign key to `DsaQuestion.id`
- `input` (String)
- `expected` (String)
- `isHidden` (Boolean, default `false`)
  - Hidden test cases are evaluated server-side but redacted from API responses.
- `question` (relation back to `DsaQuestion`)

**Indexes:**
- `@@index([questionId])` for fast lookup of test cases by question.

### 3.2 Relationship
- `DsaQuestion` has a one-to-many relationship with `DsaTestCase`:
  - One question -> many test cases
- `DsaTestCase.questionId` is the join key.

This structure ensures:
- Questions are fetched without exposing test cases (`DsaQuestion` fields only).
- Test case inputs/expected outputs are stored securely in `DsaTestCase` and only used during `run-tests`.

---

## 4. Seeding & Population

### 4.1 Seed script
The seed script is `server/prisma/seeds/dsaQuestions.seed.ts` and is run with:
- `cd server && npm run seed:dsa`

### 4.2 Seed sources
The script is designed to read existing frontend seed data:
- `src/data/dsaQuestions` (base question set) - dynamic import
- `src/data/dsaQuestionsBank` (additional question bank) - dynamic import

Notes:
- The seed uses dynamic imports so server builds do not fail if frontend modules are deleted later.
- If `src/data/dsaQuestions.ts` is missing, seeding continues using only the question bank.

### 4.3 Idempotency
Seeding is designed to be safe to re-run:
- Questions are upserted by `id`:
  - `prisma.dsaQuestion.upsert({ where: { id }, update: ..., create: ... })`
- Test cases are de-duplicated by first deleting all `DsaTestCase` rows for the set of question IDs:
  - `prisma.dsaTestCase.deleteMany({ where: { questionId: { in: questionIds } } })`
- Then re-created via `createMany` with the freshly generated test case rows.

### 4.4 Hidden test marking
The seed script marks test cases as:
- `isHidden = false` for the first testcase in each question
- `isHidden = true` for all subsequent testcases (unless there is only one testcase)

This supports the runtime rule:
- Non-hidden test cases can show full details
- Hidden test cases must not reveal `input` or `expected` to the client

---

## 5. Backend API Contracts (Authenticated)

All DSA endpoints are protected with `requireAuth`.

### 5.1 `GET /api/verification/dsa/questions`
**Purpose:** Provide the candidate the selected DSA questions for the active DSA round.

**Precondition:**
- The authenticated user must have an active verification stage row:
  - `VerificationStage.stageName = "dsa_round"`
  - `VerificationStage.status = "in_progress"`
If not found: `403` with `{ error: "DSA round is not active" }`

**Selection logic:**
- The backend fetches a pool of `DsaQuestion` rows
- It selects `DSA_QUESTIONS_COUNT` questions using role/experience distribution logic
- Difficulty is filtered by exact string match (`Easy`, `Medium`, `Hard`)
- The selection is randomized (shuffle) before returning.

**Response (array):** each element includes only question metadata (no testcases)
- `id: string`
- `title: string`
- `description: string`
- `difficulty: string`
- `examples: Json`
- `constraints: string[]`
- `starterCode: Json`

### 5.2 `GET /api/verification/dsa/practice-questions`
**Purpose:** Provide DSA practice questions before the official round starts.

**Precondition:**
- No active `dsa_round in_progress` stage is required.

**Response:** same shape as `GET /dsa/questions`, but returns a smaller set (`practiceCount = 2`).

### 5.3 `POST /api/verification/dsa/run-tests`
**Purpose:** Execute candidate code against all stored test cases for one question and return pass/fail results.

**Request body:**
- `questionId: string` (min length 1)
- `code: string` (min length 1, max length 100000)
- `language: "javascript" | "python" | "java" | "cpp" | "c"`

**Precondition:**
- User must have `dsa_round in_progress`, otherwise:
  - `403 { error: "DSA round is not active" }`

**Execution:**
- Fetch test cases for `questionId`:
  - `input`, `expected`, and `isHidden`
- Run code via Judge0 helper execution.
- Normalize outputs and compare:
  - `normalizeOutput(actual) === normalizeOutput(expected)`

**Response:**
- `passed: number`  
  - count of test cases that passed
- `total: number`  
  - total test case count
- `results: Array<...>`  
  - For each test case:
    - If hidden (`isHidden: true`):
      - `{ passed: boolean }` (redacted)
    - If not hidden:
      - `{ passed: boolean, input: string, expected: string, actual: string }`

**Hidden-test redaction rule:**
- The client will never receive `input` or `expected` for `isHidden=true`.

---

### 5.4 Compiler / Code Execution Behavior (Judge0)
This section covers what is initially displayed to the candidate (“initial compiler display”) and how the backend compiles/runs code (“compiler working”).

#### 5.4.1 What the candidate sees initially (code editor)
When the DSA round loads:
- The frontend fetches questions from `GET /api/verification/dsa/questions`.
- For each question, the frontend initializes an in-memory `code` map keyed by `question.id`.
- The initial editor code is chosen in this order:
  - `starterCode[language]` if present
  - otherwise `starterCode.python`
  - otherwise `""`

While the candidate is in the round:
- When the candidate navigates to a different question, the editor shows:
  - the existing `code[questionId]` if the candidate already ran/typed for that question
  - otherwise that question’s `starterCode` for the currently selected language (or python fallback)
- When the candidate changes the language, the editor updates the selected question’s code to that language’s `starterCode` (or python fallback).

#### 5.4.2 How the backend “compiler” runs code (Judge0)
When the candidate presses “Run test cases”, the frontend calls:
- `POST /api/verification/dsa/run-tests` with `{ questionId, code, language }`.

Backend “compiler” execution steps:
1. Authorization / precondition
   - The backend requires an active DSA stage:
     - `VerificationStage.stageName = "dsa_round"`
     - `VerificationStage.status = "in_progress"`
   - If not active, it returns `403`.

2. Test case lookup
   - The backend fetches `DsaTestCase` rows for `questionId`, selecting:
     - `input`
     - `expected`
     - `isHidden`

3. Language mapping (frontend language -> Judge0 language id)
   - `javascript` -> `63`
   - `python` -> `71`
   - `java` -> `62`
   - `cpp` -> `54`
   - `c` -> `50`

4. Per-test execution (compile + run)
   For each test case input:
   - Submits to Judge0 (single request, includes “wait”):
     - `POST ${JUDGE0_CE_URL}/submissions/?base64_encoded=false&wait=true`
     - Payload:
       - `source_code`: candidate code
       - `language_id`: mapped runtime id
       - `stdin`: test case `input` (or `""`)
       - `cpu_time_limit`: `5`
       - `wall_time_limit`: `10`
       - `memory_limit`: `256000`

   - Polling / completion behavior:
     - If the response includes a submission token and not a final stdout/stderr yet, the backend polls:
       - `GET ${JUDGE0_CE_URL}/submissions/${token}?base64_encoded=false`
     - Polling loop:
       - up to `30` attempts
       - `500ms` delay between polls
       - stops when Judge0 status id is not `1` or `2` (queued/running)
     - If it does not complete: throws `Execution timed out`.

   - Output selection for comparison:
     - The backend computes `rawActual`:
       - uses `stdout` when it exists and `stdout.trim().length > 0`
       - otherwise uses `stderr`
       - this covers both runtime errors and compilation errors.

   - Compile/runtime handling:
     - status id `6` is treated as compilation error
     - status ids `7` through `14` are treated as runtime errors
     - the backend returns an empty `stdout` and a `stderr` that prefers:
       - `compile_output` (for compilation)
       - `message` / `stderr` (for runtime/internal errors)

5. Output normalization and pass/fail
   - Before comparing, the backend normalizes output via `normalizeOutput()`:
     - converts `\r\n` to `\n`
     - trims
     - collapses whitespace sequences into a single space
   - A test is marked passed if:
     - `normalizeOutput(rawActual) === normalizeOutput(tc.expected)`

6. Response redaction (ties back to hidden tests)
   - For `isHidden=true`:
     - backend returns only `{ passed: boolean }`
   - For `isHidden=false`:
     - backend returns `{ passed, input, expected, actual }`

This ensures the candidate can see enough info to debug non-hidden tests, while hidden tests remain fully redacted.

---

## 6. Security & Integrity Guarantees
- Hidden test cases (`DsaTestCase.isHidden=true`) must not expose:
  - `input`
  - `expected`
- Evaluation happens server-side only.
- Only authenticated users can access question selection and run tests.
- Question selection is restricted to an active `dsa_round` for the official `GET /dsa/questions` endpoint.

---

## 7. Operational Notes
- Keep difficulty strings consistent with backend filtering (`"Easy"`, `"Medium"`, `"Hard"`).
- If the seed source frontend data is changed:
  - validate that `templates` keys match supported languages expected by the frontend
  - validate that `testCases` have the expected `input` and `output` fields
- Seed reruns are idempotent because:
  - questions are upserted
  - test cases for the relevant questions are fully re-created

---

## 8. Acceptance Criteria
1. `GET /api/verification/dsa/questions` returns only question metadata (no testcases) and requires an active `dsa_round`.
2. `POST /api/verification/dsa/run-tests` uses Judge0 **batch** execution, structured per-case `status`, typed comparison via `expectedType`, persists a `DsaSubmission` row (`isOfficial: false`), and rate-limits repeated runs.
3. `POST /api/verification/dsa/submit` records one **official** submission per question (`isOfficial: true`), returns `409` on duplicate official submit, and runs the same evaluation pipeline as `run-tests`.
4. Hidden test cases never return `input` or `expected` in API responses (only `{ passed, status }`).
5. Seed script requires **explicit** `examples` (never derived from test case I/O); supports per-case `expectedType` and `timeoutMs`.

---

## 9. Schema additions (`DsaTestCase` & `DsaSubmission`)

- **`DsaTestCase.expectedType`**: `"exact" | "numeric" | "array" | "set"` — selects comparator in `server/src/services/dsaComparator.ts`.
- **`DsaTestCase.timeoutMs`**: optional per-case CPU budget (ms); `null` uses `DSA_DEFAULT_TIMEOUT_MS`.
- **`DsaSubmission`**: audit log for every `run-tests` and official `submit` — stores `code`, `language`, `passedCount`, `totalCount`, `isOfficial`, redacted `results` JSON, `submittedAt`.

**Migration:** `server/prisma/migrations/20260320120000_dsa_upgrade/migration.sql`

**Env:** `DSA_DEFAULT_TIMEOUT_MS`, `DSA_QUESTIONS_COUNT`, `JUDGE0_CE_URL`

