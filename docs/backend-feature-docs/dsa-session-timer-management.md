# DSA Session and Timer Management

## High-Level Overview

The DSA round now uses backend-owned sessions instead of frontend-only timer state.

`DsaRoundSession.expTime` in Postgres is the source of truth for round expiry. The frontend only displays the remaining time returned by the backend and may count down locally for UI smoothness. It does not send remaining time back to the server.

Redis does not decide when a session expires. Redis is used for:

- latest-write-wins code draft buffers;
- latest-write-wins follow-up answer buffers;
- lightweight session state buffers;
- BullMQ delayed job storage.

BullMQ schedules and wakes a backend worker at the session expiry time. That worker calls `autoFinalizeDsaSession(roundSessionId)` to evaluate abandoned or expired sessions.

Today the BullMQ worker runs inside the API server process. Later, it can be moved to a separate worker node/process without changing the REST API contract.

## End-to-End Workflow

### Session Creation And Restore

`POST /api/verification/dsa/session`

Creates or returns the user's active DSA session. When a new session is created, the backend:

- locks the selected question IDs into `DsaRoundSession.questionIds`;
- stores `startTime`, `expTime`, and `activeQId`;
- schedules the delayed BullMQ auto-finalize job.

Session creation is concurrent-safe. The service uses a Postgres advisory lock scoped to the user before checking or creating the active session, so duplicate frontend calls return the same active session instead of creating multiple question sets.

`GET /api/verification/dsa/session`

Returns the current session snapshot:

- session timing fields;
- server-computed `secondsRemaining`;
- locked questions;
- saved code drafts;
- official submissions;
- active follow-up session, if any.

If the session is already expired, this route can also trigger auto-finalization.

`PATCH /api/verification/dsa/session`

Updates lightweight session state such as `activeQId`. The update is buffered through Redis when Redis is configured, and later flushed to Postgres.

### Code Drafts

`PUT /api/verification/dsa/session/code`

Saves the latest code draft for a session question and language. The backend validates that the question belongs to the active session before saving.

With Redis enabled, the code draft is written to a Redis key:

```text
dsa:code:{roundSessionId}:{questionId}:{language}
```

The key is also added to the dirty set:

```text
dsa:dirty:code
```

The scheduled draft flusher writes dirty code drafts to `DsaCodeSession` in Postgres.

If Redis is not configured, the backend writes directly to Postgres.

### Follow-Up Sessions

`POST /api/verification/dsa/session/follow-up/:questionId/start`

Starts or returns the follow-up session for a submitted DSA question. The backend:

- verifies the question belongs to the active round session;
- verifies an official coding submission exists for that question;
- creates or returns `DsaFollowUpSession`;
- sets `DsaRoundSession.pausedTime`;
- sets `DsaRoundSession.activeFollowUpId`;
- returns follow-up questions, saved answers, and follow-up expiry.

While a follow-up session is active, the global DSA timer is paused.

`PATCH /api/verification/dsa/session/follow-up/:questionId`

Saves selected follow-up answers. With Redis enabled, answers are written to:

```text
dsa:followup:{roundSessionId}:{questionId}
```

The key is also added to:

```text
dsa:dirty:followup
```

`POST /api/verification/dsa/session/follow-up/:questionId/submit`

Grades the follow-up answers and saves the follow-up score back to the official DSA submission. After grading, the backend resumes the global DSA timer by extending `DsaRoundSession.expTime` by the amount of time spent paused.

### Existing DSA Submission Routes

`POST /api/verification/dsa/run-tests`

Runs code against test cases and persists a non-official `DsaSubmission`. If an active session exists, the latest code draft is also buffered and the submission is linked to the session.

`POST /api/verification/dsa/submit`

Runs code against test cases and persists an official `DsaSubmission` linked by `roundSessionId`. The route is protected against duplicate official submissions for the same session/question.

`POST /api/verification/dsa`

Finalizes the round in the normal user-driven path. It computes the official score from session-linked submissions and follow-up scores, then creates `DsaRoundResult`.

## Happy Path Before End Time

In the normal flow, the user completes the DSA round before `DsaRoundSession.expTime`.

1. The user opens the DSA round.
2. The frontend calls `POST /api/verification/dsa/session`.
3. The backend creates or restores the active session and returns locked questions plus timer data.
4. The user writes code.
5. The frontend periodically calls `PUT /api/verification/dsa/session/code` to save drafts.
6. The user submits code through `POST /api/verification/dsa/submit`.
7. The backend validates the question belongs to the active session, buffers the latest code, evaluates all test cases, and writes an official `DsaSubmission` with `roundSessionId`.
8. The user starts follow-ups through `POST /api/verification/dsa/session/follow-up/:questionId/start`.
9. The backend pauses the global timer and starts the follow-up timer.
10. The user answers follow-ups.
11. The frontend saves answers through `PATCH /api/verification/dsa/session/follow-up/:questionId`.
12. The user submits follow-ups through `POST /api/verification/dsa/session/follow-up/:questionId/submit`.
13. The backend grades follow-ups, stores the follow-up score on the official submission, and resumes the global timer.
14. After all required questions are submitted and follow-ups are answered, the frontend calls `POST /api/verification/dsa`.
15. The backend computes the final score from session-linked official submissions, creates `DsaRoundResult`, updates verification stage, updates skill verification, syncs certification status, and publishes the performance pipeline event.

## Session Expiry And Auto-Evaluation Flow

Auto-evaluation is used when the user leaves the round, loses connectivity, closes the browser, or otherwise does not complete the normal final submit flow before the session expires.

### Who Knows The Expiry Time?

Postgres knows the expiry time through `DsaRoundSession.expTime`.

Redis does not inspect `DsaRoundSession.expTime` and does not independently decide whether the session expired. Redis only stores:

- buffered draft data;
- buffered follow-up data;
- buffered active-question state;
- BullMQ delayed queue metadata.

### Who Calls `autoFinalizeDsaSession`?

`autoFinalizeDsaSession(roundSessionId)` is called by the BullMQ worker.

When `createOrGetDsaSession` creates a new `DsaRoundSession`, it immediately calls:

```ts
enqueueDsaAutoFinalize(session.id, session.expTime)
```

That function adds a delayed BullMQ job with this job id:

```text
dsa:auto-finalize:{roundSessionId}
```

The delay is calculated from the session expiry:

```text
session.expTime - Date.now() + DSA_AUTO_FINALIZE_BUFFER_MS
```

BullMQ stores the delayed job in Redis. When the delay completes, BullMQ delivers the job to the worker started by:

```ts
startDsaSessionWorker()
```

The worker then calls:

```ts
autoFinalizeDsaSession(job.data.roundSessionId)
```

### Auto-Evaluation Steps

When `autoFinalizeDsaSession(roundSessionId)` runs, it performs the following steps:

1. Load the session from Postgres.
2. Stop if the session does not exist.
3. Stop if this is not the latest session for the user.
4. Stop if a `DsaRoundResult` already exists for this `roundSessionId`.
5. Check whether the session is really expired.
6. If it is not expired, re-enqueue the job for the corrected expiry time.
7. If the session is paused inside an active follow-up, inspect the follow-up session.
8. If follow-up time remains, re-enqueue the job for follow-up expiry plus buffer.
9. If the follow-up has expired, resume the global timer by extending `DsaRoundSession.expTime` by the paused duration, clear `pausedTime` and `activeFollowUpId`, and continue only if the adjusted round time is expired.
10. Force-flush Redis buffers for this session into Postgres through `flushDsaSessionBuffers`.
11. For each locked question, check whether an official `DsaSubmission` already exists.
12. If an official submission exists, leave it unchanged.
13. If no official submission exists, read the latest saved code draft from Redis/Postgres.
14. If code exists, evaluate that code against all test cases through the normal DSA evaluation and Judge0 path.
15. If no code exists, create a zero-score wrong-answer result for that question.
16. If Judge0 or execution infrastructure fails, create a zero-score internal-error result for that question.
17. Read latest follow-up answers from Redis/Postgres.
18. Grade follow-up answers with `allowIncomplete: true`, so missing answers score zero instead of blocking finalization.
19. Create official `DsaSubmission` rows for all missing questions.
20. Compute the total session score.
21. Create one `DsaRoundResult` linked to `roundSessionId`.
22. Update `verificationStage`.
23. Update `SkillVerification`.
24. Sync certification status.
25. Publish the DSA result to the performance pipeline.

Auto-finalization is designed to be idempotent. Duplicate delivery or retries are safe because the function checks existing `DsaRoundResult`, existing official submissions, and session-linked records before writing final data.

## Scaling The BullMQ Worker Later

Currently, the BullMQ worker runs inside the backend API process. This is acceptable for the first version, but as traffic grows it can add CPU and Judge0 workload pressure to API servers.

To scale later, keep API servers responsible for REST traffic and job enqueueing, but move BullMQ job processing to a separate worker process or worker node.

Recommended future structure:

- API process:
  - serves Express routes;
  - creates DSA sessions;
  - enqueues delayed BullMQ jobs;
  - does not process auto-finalize jobs.
- Worker process:
  - imports `startDsaSessionWorker()`;
  - processes `dsa-session` BullMQ jobs;
  - calls `autoFinalizeDsaSession`;
  - can be scaled independently from API servers.

Add an environment flag such as:

```env
DSA_SESSION_WORKER_ENABLED=true
```

Recommended deployment values:

```env
# API deployment
DSA_SESSION_WORKER_ENABLED=false

# Worker deployment
DSA_SESSION_WORKER_ENABLED=true
```

Both API and worker deployments must share:

- `REDIS_URL`;
- database connection settings;
- Judge0 configuration;
- app secrets needed by downstream services;
- the same BullMQ queue name, currently `dsa-session`.

Do not use different queue names for API and worker. The API enqueue path and worker processing path must point to the same BullMQ queue.

Worker nodes can be scaled horizontally by increasing worker replicas and tuning:

```env
DSA_AUTO_FINALIZE_CONCURRENCY=2
```

The draft buffer flusher should also keep running somewhere reliable. Either keep `startDsaDraftBufferFlusher()` enabled in API and worker processes, or move it into a dedicated background worker. Auto-finalization also force-flushes buffers for its own session before grading, so final scoring reads the latest available Redis data.

Because `autoFinalizeDsaSession` is idempotent, BullMQ retries and duplicate job delivery are safe. Production monitoring should still alert on repeated job failures, queue backlog growth, and Judge0 infrastructure errors.

## Schemas

### `DsaRoundSession`

Stores the official backend session for a DSA round.

Important fields:

- `userId`: session owner.
- `questionIds`: locked question IDs for this round.
- `startTime`: when the round started.
- `expTime`: authoritative global round expiry.
- `pausedTime`: set when the global timer is paused during follow-ups.
- `activeQId`: currently active coding question.
- `activeFollowUpId`: currently active follow-up session, if any.

Purpose:

- prevents refresh from creating a new timer or new question set;
- allows backend restore after browser refresh;
- gives auto-finalization a durable source of truth.

### `DsaCodeSession`

Stores recoverable code drafts.

Important fields:

- `roundSessionId`;
- `userId`;
- `questionId`;
- `language`;
- `code`.

Uniqueness:

```text
roundSessionId + questionId + language
```

Purpose:

- restores code after refresh;
- provides latest available code for auto-evaluation if the user abandons the round.

### `DsaFollowUpSession`

Stores follow-up timer and selected answers.

Important fields:

- `roundSessionId`;
- `userId`;
- `questionId`;
- `answers`;
- `startTime`;
- `expTime`;
- `pausedTime`.

Uniqueness:

```text
roundSessionId + questionId
```

Purpose:

- prevents multiple follow-up timers for the same session question;
- restores selected answers after refresh;
- supports partial follow-up grading during auto-finalization.

### `DsaSubmission.roundSessionId`

Links run-test and official submissions to a specific DSA round session.

Purpose:

- separates current-session grading from older historical submissions;
- lets final scoring use the correct official submission set.

### `DsaRoundResult.roundSessionId`

Links final round result to a specific DSA round session.

Purpose:

- prevents duplicate finalization for the same session;
- allows auto-finalization to safely check whether the session is already complete.

## Design Decisions

- Backend time is authoritative. The frontend never sends remaining round time.
- Offline coding time continues to count down.
- Follow-up time pauses the global DSA timer.
- Redis is used for latest-write buffers and BullMQ delayed job storage, not as the source of truth for expiry.
- Postgres remains the source of truth for sessions, expiry, official submissions, and final results.
- Redis-backed draft writes are latest-write-wins to reduce database write pressure.
- If Redis is not configured, draft/follow-up/session state falls back to direct DB writes.
- Scheduled auto-finalization requires Redis/BullMQ.
- BullMQ delayed jobs auto-finalize abandoned sessions after expiry plus buffer.
- Postgres advisory locks prevent duplicate active sessions, duplicate follow-up starts, and duplicate official submissions.
- Existing `DsaSubmission` remains the official grading record.

## Test And Review Checklist

- Refresh during coding restores the same questions, same code, and correct remaining server time.
- Refresh during follow-up restores saved answers and follow-up timer.
- Duplicate `POST /api/verification/dsa/session` requests return the same active session.
- Manual submit before expiry creates session-linked official submissions.
- Manual final submit creates a session-linked `DsaRoundResult`.
- Expired abandoned sessions auto-finalize once using latest drafts and answers.
- Auto-finalize delayed job is created when a new session is created.
- If auto-finalize runs too early because the session was paused for follow-ups, it re-enqueues itself.
- Redis unavailable path still persists drafts directly to DB.
- Scheduled auto-finalization is verified with Redis/BullMQ enabled.
- Judge0 failure during auto-finalize records internal-error zero-score data without blocking round finalization.
- Separate worker deployment can process existing delayed jobs without changing API behavior.
