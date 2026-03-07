# Verification Ideology and Flow (All Roles)

This document explains how the ProvenHire verification system works today for all job-seeker role types, including:

- Stage pipeline by role
- Stage status lifecycle and progression rules
- Scoring and qualification gates
- Retry and reset behavior
- Proctoring and risk monitoring model
- Dashboard/UX behavior

---

## 1) Core Philosophy

Verification is designed around a **progressive trust pipeline**:

1. Collect profile and role context
2. Validate role-fit skills with increasingly strict assessments
3. Enforce test integrity through proctoring
4. Gate access to final human evaluation based on evidence

The same infrastructure is shared across role types, but stage count and gate rules differ by track.

---

## 2) Role-Based Stage Pipelines

## Technical Role Path (5 stages)

1. `profile_setup`
2. `aptitude_test`
3. `dsa_round`
4. `expert_interview` (AI)
5. `human_expert_interview`

## Non-Technical Role Path (3 stages)

1. `profile_setup`
2. `non_tech_assignment`
3. `human_expert_interview`

---

## 3) Stage Status Model

Each stage can be in one of these states:

- `locked`
- `in_progress`
- `completed`
- `failed`

### General progression principle

- Only the next eligible stage is active.
- Completing a stage unlocks or starts the next stage (based on gate logic).
- Failed stages remain retryable.
- Resetting a stage resets that stage and all downstream stages.

---

## 4) Initialization and Persistence

When a user opens verification:

1. System loads user profile and `roleType`.
2. If no stage records exist, stage rows are auto-created for that role path.
3. If schema changed in newer releases, missing stages are inserted.
4. Current stage is chosen in this order:
   - first `in_progress`
   - else first `failed`
   - else first `locked`
   - else next stage after latest completed

This ensures users can log out and resume exactly where they left off.

---

## 5) Scoring and Qualification Rules

## Aptitude Test (`aptitude_test`)

- Questions are loaded from server session.
- Score is computed from answer key (server-side).
- Pass threshold comes from question session metadata (current configured threshold is used in UI and server result).
- On pass:
  - stage marked `completed`
- On fail:
  - stage marked `failed`
  - user can retry

## DSA Round (`dsa_round`)

- Candidate solves multiple coding questions.
- Per-question code run gives test pass metrics.
- Final round score stored as 0-100.
- Eligibility threshold: `60/100`.
- On pass:
  - stage marked `completed`
- On fail:
  - stage marked `failed`
  - user can retry

## AI Expert Interview (`expert_interview`) [Technical]

- After completion, shortlisting combines:
  - Stage 2 (Aptitude): 25%
  - Stage 3 (DSA): 35%
  - Stage 4 (AI Interview): 40%
- Combined threshold: `65%`.
- If shortlisted:
  - Human Expert Interview becomes available.
- If not shortlisted:
  - Human stage remains locked.

## Non-Technical Assignment (`non_tech_assignment`)

- Candidate submits assignment response.
- Backend AI evaluator scores response (`0-100`) using role + prompt + answer.
- Qualification threshold: `60/100`.
- If score >= 60:
  - assignment stage `completed`
  - `human_expert_interview` set to `in_progress`
- If score < 60:
  - assignment stage `failed`
  - `human_expert_interview` kept `locked`
  - user must retry assignment

## Human Expert Interview (`human_expert_interview`)

- Final live interview scheduling and completion stage.
- On completion:
  - stage marked `completed`
  - job seeker profile verification status set to `verified`

---

## 6) Retry, Cooldown, and Reset Behavior

### Generic reset endpoint behavior

Resetting any stage:

- sets chosen stage to `in_progress`
- sets all downstream stages to `locked`
- clears downstream scores

### Special reset rule

- Resetting `aptitude_test` also clears aptitude question session state.

### Cooldowns and invalidations

- Cooldown checks for Aptitude/DSA are integrated in UI flow.
- Invalidated tests can trigger retake flow.
- UI warns candidate and blocks immediate retry if cooldown active.

---

## 7) Proctoring Ideology

Verification assessments are expected to be proctored.

### Pre-test trust contract

Before test start, candidate must:

- Grant camera/microphone access
- Grant screen share/fullscreen context as required
- Accept explicit consent checkbox
- Acknowledge checklist:
  - Camera required
  - Microphone required
  - Fullscreen required
  - No tab switching

### Proctoring risk model

A unified monitor tracks suspicious behavior and increments risk score.

Risk buckets:

- `0-19`: clean
- `20-49`: suspicious
- `50+`: high risk

Event examples:

- `TAB_SWITCH`
- `WINDOW_FOCUS_LOST`
- `FULLSCREEN_EXIT`
- `COPY_PASTE_ATTEMPT`
- `DEVTOOLS_OPENED`
- `NO_FACE_DETECTED`
- `MULTIPLE_FACES_DETECTED`
- `LOOKING_AWAY_FROM_SCREEN`
- `LOW_VISIBILITY`
- `SUSPICIOUS_BACKGROUND_NOISE`
- `CANDIDATE_SPEAKING_DURING_CODING`
- `MULTIPLE_VOICES_DETECTED`
- `MICROPHONE_MUTED_ATTEMPT`

Events are logged with timestamp + risk context and shown in admin alert surfaces.

---

## 8) Dashboard Experience Ideology

### Job Seeker Dashboard stage cards

- Technical users see 5 verification cards.
- Non-technical users see 3 verification cards.
- Stage card action behavior:
  - `active` -> Start/Retry button shown
  - `done` -> score/completion metadata shown
  - `locked` -> no action

### Resume-after-login behavior

If user left mid-pipeline and returns later:

- next eligible stage appears as active
- dashboard offers direct start button for that stage
- verification page loads to in-progress/failed/next-locked stage automatically

---

## 9) Non-Technical Assignment Decision UX

After assignment submission, candidate sees:

- AI score (`X/100`)
- Qualification threshold
- Qualified / Not Qualified decision
- Summary feedback
- Strengths and improvement gaps

Actions:

- Qualified -> Continue to Human Expert Interview
- Not qualified -> Retry Assignment

---

## 10) Admin Observability

Proctoring events are stored and surfaced through admin alert UI for monitoring.

Stored event dimensions include:

- candidate/user id
- session/test id
- event type
- severity
- risk score
- structured details
- created timestamp

This gives admins timeline-style visibility into suspicious patterns during assessments.

---

## 11) Current Source-of-Truth Components

Main verification orchestrator:

- `src/pages/verification/VerificationFlow.tsx`
- `server/src/routes/verification.ts`

Scoring/selection logic:

- `src/lib/shortlisting.ts` (technical shortlisting)
- `server/src/services/ai.service.ts` (`evaluateNonTechnicalAssignment`)

Proctoring and event logging:

- `src/hooks/useProctoringRiskMonitor.ts`
- `src/components/ProctoringSetupGate.tsx`
- `server/src/routes/proctoring.ts`

---

## 12) Design Intent Summary

The system balances candidate fairness and hiring signal quality by:

- keeping role-specific paths simple
- using objective thresholds before human bandwidth is consumed
- making progression deterministic and restart-safe
- integrating transparent proctoring with explicit consent
- preserving resumability across sessions and devices

This is the foundational ideology behind verification for all role tracks in the current implementation.

