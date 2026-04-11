# PRD — Business rules & engineering backlog

**Version:** 6.9 · **April 2026**  
**Consolidated April 2026.** Part 1 = revenue and limits (formerly *PRD_REVENUE_AND_BUSINESS_RULES*). Part 2 = implementation backlog (formerly *PRD_TECHNICAL_IMPLEMENTATION_REMAINING*).

**Index:** [PRD.md](PRD.md) (index) · [PRD_CANDIDATE.md](PRD_CANDIDATE.md) (candidate) · [PRD_RECRUITER.md](PRD_RECRUITER.md) (recruiter) · [README.md](README.md)

---

# Part 1 — Revenue model and business rules

**ProvenHire v2.0 · Decisions locked · April 2026**

**Implementation index:** `server/src/constants/revenue.ts` · `server/src/services/candidateRetake.service.ts` · `server/src/services/verificationStageRetakeGate.service.ts` · `server/src/utils/recruiterSubscription.ts` · `server/src/services/recruiterUsagePeriod.service.ts` · migrations through `20260411160000_revenue_prd4_usage_retakes`.

**Related:** [PRD_RECRUITER.md](PRD_RECRUITER.md) §9 · [README.md](README.md)

---

## 1. Two revenue streams

| Stream | Who pays | Model |
|--------|----------|--------|
| **1** | Candidates | First AI interview attempt free; **retakes** paid (selected stages). |
| **2** | Recruiters | **Monthly subscription** (discovery limits) + **per-use** (extra JD AI interviews, human expert interviews). |

Streams are independent.

---

## 2. Candidate revenue

### Pricing

| Item | Price |
|------|------|
| First AI interview attempt (any paid-track type) | Free |
| Single retake | ₹399 |
| Two-retake bundle | ₹649 (save ₹149) |

### Paid vs free retakes (by stage)

| Stage | Retake |
|-------|--------|
| CS Fundamentals | Free |
| DSA Round | Free |
| AI Skills Interview | Paid (₹399 / bundle) |
| System Design Interview | Paid |
| AI Expert Interview (`expert_interview` / `ai_expert`) | Paid |

### Cooldowns (server-enforced)

| Stage | After attempt |
|-------|----------------|
| CS Fundamentals | 24 h |
| DSA Round | 48 h |
| AI Skills / System Design | 7 days |
| AI Expert | 30 days |

### Retake bundle

- ₹649 = **2** ledger credits; each credit consumed when a **paid** retake **starts** (see `CandidateRetakeLedger`).
- Unused credits expire **90 days** from purchase (`CANDIDATE_RETAKE_CREDIT_VALIDITY_DAYS`).

### Skill / verification validity (product truth; expiry UX may ship incrementally)

| Stage | Validity (days) |
|-------|------------------|
| CS Fundamentals | 180 |
| DSA | 90 |
| AI Skills | 180 |
| System Design | 180 |
| AI Expert | 365 |

### Admin (manual UPI until Razorpay)

- Grant credits: `POST /api/admin/users/:id/grant-retake` body `{ "packageType": "single" | "bundle" }`.

---

## 3. Recruiter revenue

### Subscription tiers

| Tier | Price (INR/mo) | Active jobs | Profile views/mo | Contacts/mo | JD interviews/mo | Analytics |
|------|----------------|------------|------------------|-------------|------------------|-----------|
| Free | 0 | 2 | 5 | 0 | 0 | No |
| Starter | 2,999 | 5 | 50 | 10 | 5 | No |
| Growth | 7,999 | Unlimited | Unlimited | 30 | 10 | Yes |

**Profile view:** one credit per first **full** ProvenHire Resume open per recruiter–candidate pair (grid browse does not consume).

**Contacts:** each **Express Interest** (`POST /api/notifications/contact-candidate`) uses one credit (free tier =  **0** → upgrade required).

**JD interviews:** included credits do **not** roll over; overage billed per session when product flow is wired (`jdInterviewCountMonth`).

**Monthly reset:** usage counters align to **calendar month** (UTC month start); see `recruiterUsagePeriod.service.ts`.

### Per-use (recruiter)

| Item | Price | Note |
|------|------|------|
| JD AI interview (beyond plan) | ₹799 / session | When flow charges overage |
| Human expert interview | ₹2,500 / session | Recruiter-paid add-on |

### Admin (manual UPI until Razorpay)

- Set plan: `PATCH /api/admin/recruiters/:id/plan` body `{ "subscriptionTier": "free" | "starter" | "growth" }` (`:id` = **recruiter profile id**).

### Recruiter usage API ( implemented )

- `GET /api/users/me/recruiter-subscription` — tier, limits, MTD `used` counters, `periodStart`.

---

## 4. Expert interviewer compensation

| Phase | INR / session | Notes |
|-------|---------------|--------|
| Founding (first ~15) | 750 | |
| Standard | 1,500 | |
| Premium niche | 2,000 | ML, blockchain, embedded, etc. |

Recruiter pays ₹2,500 / human expert session (standard economics); payout process: manual UPI weekly until automated payouts.

**Careers copy:** see main PRD §4 / product marketing; founding program emphasizes ₹750 / session and monthly earning range.

---

## 5. Progressive reveal (recruiter ↔ candidate)

Design intent: reduce off-platform hiring after light contact.

| Step | Recruiter sees |
|------|----------------|
| 9-profile (or search) grid | Badge, score, role, top verified skills |
| Full resume (1 view credit) | Full ProvenHire Resume — **no** contact details |
| After interest accepted | Name, email, LinkedIn |
| After first interview completed | Phone (last) |

---

## 6. Parked (not in scope)

- Razorpay — after ~₹50k manual payments
- Success fees — after ~200 recorded hires
- Enterprise / annual plans — when demand is proven

---

## 7. Metrics (targets)

See original PRD 4 stakeholder doc: first-attempt completion, retake purchase rate, free→starter conversion, JD interview usage, churn, etc.

---

*Canonical business rules for engineering; cross-check enums and limits in `recruiterSubscription.ts` and `revenue.ts`.*

---

# Part 2 — Technical implementation backlog

## Everything That Still Needs To Be Built

**Version:** 1.0 · April 2026  
**Purpose:** One document for implementation of everything remaining  
**Read before touching any file:** Read the files listed in each section first  

---

## CRITICAL: READ BEFORE STARTING

This codebase is live with ~25 real users. The following are already working
and must NOT be broken:

```
✅ DO NOT TOUCH — WORKING IN PRODUCTION:
- server/src/services/interview/orchestrator.ts (AI Expert Interview v2)
- server/src/services/interview/agents.ts
- server/src/routes/interview.ts (v1 + v2 routes)
- server/src/routes/verification.ts (aptitude, DSA, stages)
- server/src/services/verificationScoring.service.ts
- server/src/services/candidateRetake.service.ts
- server/src/services/recruiterUsagePeriod.service.ts
- server/src/constants/revenue.ts
- All auth routes
- All existing migrations
```

**Implementation order is mandatory. Do not start Step N before Step N-1 is tested.**

---

# STEP 1 — AI SKILLS INTERVIEW (Real Session)

## What It Is

A 30-minute AI interview that runs after the DSA Round.
Two components in one session:

- **Part A (5 questions):** AI asks about the candidate's actual DSA submissions
- **Part B (6–10 questions depending on track):** AI verifies each skill on the resume

This is the gate to L2 certification. Nothing else works until this exists.

## Files to Read First

```
server/src/services/interview/orchestrator.ts    ← copy the session pattern
server/src/services/interview/agents.ts          ← copy the agent pattern
server/src/routes/interview.ts                   ← copy the v2/start and v2/turn pattern
server/src/types/dsaContext.ts                   ← DSAContext type already defined
server/src/constants/verificationPipeline.ts     ← VERIFICATION_PIPELINE_V2 constant
server/src/constants/revenue.ts                  ← cooldowns and thresholds
server/prisma/schema.prisma                      ← Interview model, interviewType field
src/pages/verification/stages/ExpertInterviewStage.tsx ← copy the UI pattern
```

## Backend Changes

### 1.1 New service: `server/src/services/interview/aiSkillsOrchestrator.ts`

This is a separate orchestrator from the existing adversarial v2.
**Do NOT modify `orchestrator.ts`.** Create a new file.

```typescript
// Session state for AI Skills Interview
interface AISkillsSessionState {
  phase: 'dsa_walkthrough' | 'skill_checkup' | 'complete';
  dsaProblems: DSAContext['problems'];           // loaded from DsaRoundResult
  resumeSkills: string[];                        // loaded from JobSeekerProfile
  questionsAsked: number;
  dsaQuestionsAsked: number;
  skillQuestionsAsked: number;
  skillsChecked: Map<string, number>;            // skill → confidence score 0-100
  currentSkillIndex: number;
  history: Array<{ role: 'ai' | 'user'; content: string }>;
  experienceLevel: 'fresher' | 'mid' | 'senior';
  jobRole: string;
  turnLog: TurnLogEntry[];
}

// Target question counts by phase and track:
// Fresher: 5 DSA questions + 6 skill questions = 11 total
// Mid:     5 DSA questions + 8 skill questions = 13 total
// Senior:  5 DSA questions + 10 skill questions = 15 total

// Skill confidence thresholds (from PRD):
// Fresher: ≥ 60 → verified
// Mid:     ≥ 65 → verified
// Senior:  ≥ 70 → verified
```

**DSA Walkthrough Questions (Part A):**

For EACH problem the candidate attempted in the DSA Round (fully or partially correct):

For fully correct problems, generate questions like:

- "Walk me through your approach to [problem title]. What was your initial thinking?"
- "What is the time complexity of your solution and why?"
- "How would you optimize this solution further?"
- "What edge cases did your solution handle?"
- "Could you solve this with less memory? How?"

For PARTIALLY CORRECT problems (mandatory — these are more valuable):

- "You attempted [problem title] — your solution passed [N] of [total] test cases. Walk me through your approach."
- "Where do you think your solution broke down?"
- "What did you try when your first approach failed?"
- "If you had more time, how would you complete this?"

**CRITICAL implementation detail:**

Load DSA context at session start:

```typescript
const loadDSAContext = async (userId: string): Promise<DSAContext> => {
  // Get the most recent completed DSA round result
  const dsaResult = await prisma.dsaRoundResult.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  // Get the actual problem details and submitted code
  const problems = await Promise.all(
    Object.entries(dsaResult.answers as Record<string, any>)
      .map(async ([questionId, submission]) => {
        const question = await prisma.dsaQuestion.findUnique({
          where: { id: questionId }
        });
        const testResults = await prisma.dsaSubmission.findFirst({
          where: { userId, questionId, isOfficial: true },
          orderBy: { submittedAt: 'desc' }
        });
        return {
          problemId: questionId,
          title: question.title,
          description: question.description,
          difficulty: question.difficulty,
          candidateCode: submission.code,
          language: submission.language,
          testCasesPassed: testResults?.passedCount ?? 0,
          testCasesTotal: testResults?.totalCount ?? 0,
          isFullySolved: (testResults?.passedCount ?? 0) === (testResults?.totalCount ?? 1),
          isPartiallySolved: (testResults?.passedCount ?? 0) > 0 &&
                             (testResults?.passedCount ?? 0) < (testResults?.totalCount ?? 1)
        };
      })
  );

  return { problems };
};
```

**Skill Checkup Questions (Part B):**

Load skills from candidate profile:

```typescript
const loadResumeSkills = async (userId: string): Promise<string[]> => {
  const profile = await prisma.jobSeekerProfile.findFirst({
    where: { userId }
  });
  return profile.skills as string[] ?? [];
};
```

Generate 2 questions per skill, calibrated to experience level:

**Fresher depth example (React):**

- "Explain how React's virtual DOM works in your own words."
- "What is the difference between props and state in React?"

**Mid depth example (React):**

- "You've used React in a real project. Describe a performance issue you encountered and how you solved it."
- "When would you choose useCallback over useMemo? Give a real scenario."

**Senior depth example (React):**

- "Describe the most complex React architecture you've designed. What were the trade-offs you made around state management?"
- "Walk me through how you would build a custom rendering pipeline for a data-heavy dashboard with 10,000+ rows."

**Scoring each skill:**

After both questions for a skill are answered, score the candidate's confidence 0–100:

- 90–100: Expert depth, correct details, real examples
- 70–89: Solid understanding, minor gaps
- 50–69: Basic awareness, cannot go deep
- 30–49: Surface level only, likely bluffing
- 0–29: Does not know this skill

Store confidence score per skill in `CandidateSkillVerification.confidenceScore`.

**Session termination:**

- Complete when all DSA questions done AND all skills checked
- OR when total questions reach the track maximum
- OR when 30 minutes elapsed from session start

**Final scoring:**

```typescript
const computeAISkillsScore = (sessionState: AISkillsSessionState): number => {
  // DSA understanding score: average of per-turn scores during Part A
  const dsaScore = sessionState.dsaUnderstandingScores.reduce((a, b) => a + b, 0)
    / sessionState.dsaUnderstandingScores.length;

  // Skills score: average of verified skill confidence scores
  const skillScores = Array.from(sessionState.skillsChecked.values());
  const skillScore = skillScores.reduce((a, b) => a + b, 0) / skillScores.length;

  // Weighted: DSA walkthrough 50% + skill checkup 50%
  return Math.min(100, Math.max(0, Math.round(dsaScore * 0.5 + skillScore * 0.5)));
};
```

**Pass thresholds:**

```typescript
const AI_SKILLS_PASS_THRESHOLD = {
  fresher: { minScore: 50, minVerifiedSkills: 2 },
  mid:     { minScore: 55, minVerifiedSkills: 3 },
  senior:  { minScore: 60, minVerifiedSkills: 4 },
};
```

### 1.2 New API routes (add to `server/src/routes/interview.ts`)

```http
POST /api/interview/ai-skills/start
```
- `requireAuth` (job seeker)
- Body: `{ jobRole: string, experienceLevel: 'fresher'|'mid'|'senior' }`
- Checks: (1) `ai_skills_interview` stage `in_progress`, (2) DSA round completed (`DsaRoundResult`), (3) no active AI Skills session, (4) paid retake gate / ledger if retry
- Create `Interview` with `interviewType: 'ai_skills'`, `dsaContextLoaded: true`; load DSA context + resume skills
- Returns: `{ interviewId, firstQuestion, phase: 'dsa_walkthrough', questionsTotal }`

```http
POST /api/interview/ai-skills/turn
```
- Body: `{ interviewId, answer, turnId?, inputMode?, transcriptionConfidence? }`
- Returns: `{ response, acknowledgement, phase, questionsAsked, questionsTotal, complete, turnId, score?, verifiedSkills? }`
- On complete: persist per-skill confidence, `VerificationStage`, skill rows, resume update (async)

```http
GET /api/interview/ai-skills/status
```
- Current session state for reload / resume UI

### 1.3 On completion — update verification and skills

`finalizeAISkillsInterview(interviewId, userId, sessionState, score, track)` should:

1. **Interview row** — `totalScore`, `status: completed`, `interviewType: ai_skills`, `dsaContextLoaded: true`
2. **VerificationStage** `ai_skills_interview` — `completed` or `failed` + `score`
3. **CandidateSkillVerification** — upsert each skill with `confidenceScore`, `verifiedInStage`, `status`, `expiresAt` (e.g. +180 days) using tier thresholds (`SKILL_CONFIDENCE_THRESHOLD[track]`)
4. **ProvenHire Resume** — `updateProvenHireResumeSkills(userId, track)` (non-blocking)
5. **L2** — fresher + pass → `maybeUnlockL2Certification`; mid/senior need System Design too for L2

Align Prisma field names and unique constraints with the **actual** schema (`CandidateSkillVerification` keys, etc.) before implementing.

### 1.4 Frontend — new stage component

Create: `src/pages/verification/stages/AISkillsInterviewStage.tsx`

Pattern: copy `ExpertInterviewStage.tsx` as the base.

**Key differences from ExpertInterviewStage:**

- Uses `/api/interview/ai-skills/start` and `/api/interview/ai-skills/turn`
- Phase indicator: "DSA Walkthrough (Q1 of 5)" → "Skill Verification (React)"
- No sprint strip (different structure)
- Progress bar: questions completed / total
- Same voice stack: `useWhisperSession` + Cartesia TTS + filler pre-cache
- Same proctoring: `useProctoringRiskMonitor`
- Same stale-response protection: `currentTurnIdRef`
- On completion: verified skills list with confidence bars

**Phase transition UI:** Banner when moving from DSA walkthrough to skill checkup.

Replace `PipelineStagePlaceholder` for `ai_skills_interview` in `VerificationFlow.tsx` with this component.

---

# STEP 2 — DSA CONTEXT INJECTION (Wire the existing type)

Handled inside Step 1 (`loadDSAContext`). Verify after Step 1:

- `DsaRoundResult` exists; answers JSON has submission shape; `DsaSubmission` has pass counts.
- Set `Interview.dsaContextLoaded = true` when session is created.
- Edge case: no code stored → fall back to general DSA questions from problem statement; do not block the session.

---

# STEP 3 — SYSTEM DESIGN INTERVIEW (Real Session)

**Status (April 2026):** **Data track** session is **shipped**; **software** `system_design_interview` may still use a **placeholder** in `VerificationFlow.tsx` until the same or a shared orchestrator is wired for `roleType: technical` mid/senior.

Target product shape: ~**30 minutes**, **LLD** then **HLD** (data: schema/partitioning/quality then platform/scale/reliability).

## Files to Read First

Same as Step 1. Additionally:

```
server/src/constants/verificationPipeline.ts
server/src/constants/revenue.ts
server/src/services/interview/systemDesignOrchestrator.ts
```

## Implemented — Data track (`data_system_design`)

### Backend

- **Service:** `server/src/services/interview/systemDesignOrchestrator.ts` (LLD → HLD phases, **`interviewType: "system_design"`**, persists `lldScore` / `hldScore`, updates verification stage **`data_system_design`**).
- **Question + evaluation helpers:** `generateDataSystemDesignQuestion`, `evaluateDataSystemDesignSession` in `agents.ts`.
- **Routes:** `POST /api/interview/data-system-design/start`, `POST /api/interview/data-system-design/turn`, `GET /api/interview/data-system-design/status` in `interview.ts`.
- **Gates:** Candidate must have **`data_skills_interview`** completed and verification stage **`in_progress`**; retake/cooldown via existing paid-stage patterns (`data_system_design` maps to `system_design` interview type for ledger).

### Frontend

- **`src/pages/verification/stages/DataSystemDesignStage.tsx`** — typed answers, optional TTS “Play question”, wired from **`VerificationFlow`** for stage **`data_system_design`**.

### L2 unlock (data)

- **Fresher:** L2 when **`data_skills_interview`** complete (no `data_system_design` in pipeline).
- **Mid/senior:** L2 when **`data_skills_interview`** and **`data_system_design`** both complete — see `verificationScoring.service.ts`.

## Backlog — Software track (`system_design_interview`)

- Reuse or generalize orchestrator for **software** system design (`POST /api/interview/system-design/*` or alias), problem generation for services/APIs, and replace **`PipelineStagePlaceholder`** in `VerificationFlow.tsx`.
- Align pass thresholds and timers with stakeholder sign-off (current data eval uses model-graded scores with tiered pass hints in `evaluateDataSystemDesignSession`).

---

# STEP 4 — PROVENHIRE RESUME

Verified, evidence-based profile (not a free-form editable resume).

## Files to Read First

```
server/prisma/schema.prisma
server/src/routes/users.ts
server/src/services/ai.service.ts
src/pages/dashboard/JobSeekerDashboard.tsx
```

## Backend Changes

### 4.1 New Prisma model `ProvenHireResume`

Fields (per stakeholder spec): `userId` unique, `certificationLevel`, `verifiedSkills` / `claimedSkills` JSON, `projects` JSON, `assessmentScores` JSON, `shareableHandle`, `isPublic`, `pendingCandidateReview`, timestamps, relation to `User`.

**Note:** Cross-check existing `provenhireResume.service.ts` / public routes — merge or migrate rather than duplicating if a row model already exists.

### 4.2 Service: `provenHireResume.service.ts` (extend or replace)

`getOrCreateResume`, `updateSkillsSection`, `extractProjectFromInterview` (Gemini on Project Defense sprint), `generateShareableHandle`, `updateAssessmentScores`, `updateCertificationLevel`.

### 4.3 API routes

- `GET /api/users/me/provenhire-resume`
- `POST .../project/:projectId/approve`
- `POST .../change-request`
- `GET /api/users/candidates/:profileId/resume` (recruiter; credits)
- `GET /verified/:handle` public
- Admin: approve project on resume

### 4.4 Trigger points

Wire updates after: AI Skills pass, AI Expert admin approval, System Design complete, DSA complete, profile setup (empty resume + handle).

### 4.5 Frontend

- `ProvenHireResumePage.tsx` — `/dashboard/jobseeker/resume` + sidebar link.
- `PublicProfile.tsx` — `/verified/:handle`.

---

# STEP 5 — PAYWALL UI

Backend gates exist; align error payloads if needed (`retake_required`, `stage`, `cooldownUntil`).

## Frontend

- `PaywallModal.tsx` — ₹399 / ₹649, UPI instructions, cooldown line.
- Wire 402 / `retake_required` in `VerificationFlow`, `ExpertInterviewStage`, `AISkillsInterviewStage`, `SystemDesignInterviewStage`.
- Admin: Grant Retake in Job Seekers table → `POST /api/admin/users/:id/grant-retake`.

---

# STEP 6 — JD-BASED AI INTERVIEW (Recruiter Product)

Reuse v2 orchestrator with JD context injected.

## Backend

- Model `JDInterview` (recruiter, candidate, job, `interviewId`, status, expiry 48h, `fitReport`, `fitScore`).
- Routes: request, accept, decline, start (consume JD credit when started), recruiter report list, fit report GET.
- `generateJDFitReport` after completion.
- Cron: `expire-jd-interviews` (hourly).

## Frontend

- Notifications: accept / decline JD request.
- Job seeker dashboard: pending JD interviews.
- Recruiter: request button on profile, Interviews tab, `JDFitReport.tsx`.

---

# STEP 7 — RECRUITER DISCOVERY (9-Profile Grid)

- Service `candidateRecommendation.service.ts` (or extend `jobRecommendations.service.ts`).
- `GET /api/jobs/:jobId/recommendations?page=0`
- `CandidateDiscoveryGrid.tsx` — 3×3, first 2 free vs locked for free tier.

**Note:** Repo may already have `JobCandidateDiscovery` / recommendations — reconcile before greenfielding.

---

# STEP 8 — DATABASE MIGRATION

After schema changes:

```bash
cd server && npx prisma migrate dev --name v2_full_feature_set
```

Production:

```bash
npx prisma migrate deploy
```

New models / fields per Steps 4 and 6 (and any interview flags). Cross-check existing `Job` fields before adding duplicates.

---

# STEP 9 — WIRING AND INTEGRATION CHECKS

Verify end-to-end:

- Fresher pipeline through AI Skills → L2 → AI Expert → L3 → resume → public handle.
- Mid/senior: DSA → AI Skills → System Design → L2 → expert → L3.
- Retake + paywall + admin grant.
- JD interview request → accept → v2 with JD → fit report + credit consumption.

---

# ENVIRONMENT VARIABLES

Confirm on Render (or host):

```
GEMINI_API_KEY
OPENAI_API_KEY
CARTESIA_API_KEY
CARTESIA_VOICE_ID
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
BANK_DETAILS_ENCRYPTION_KEY
CRON_SECRET
RESEND_API_KEY
EMAIL_FROM
```

---

# WHAT NOT TO BUILD (Out of Scope)

- Razorpay (manual UPI until threshold)
- Recruiter analytics dashboard (after JD flow)
- Recruiter-paid human expert interview (after JD)
- Company team scheduling
- 90-day refresh email campaign
- Skill dispute flow v1
- Success fees; annual recruiter plans

---

# IMPLEMENTATION ORDER — STRICT

```
Step 1: AI Skills Interview backend + frontend
Step 2: DSA context injection (part of Step 1)
Step 3: System Design Interview backend + frontend (**data track: done**; **software track: pending**)
Step 4: ProvenHire Resume backend + frontend
Step 5: Paywall UI
Step 6: JD-based AI Interview
Step 7: Recruiter Discovery Grid
Step 8: Migration
Step 9: End-to-end integration testing

Do NOT start Step N before Step N-1 is tested end-to-end.
Each step is independently valuable and shippable.
```

---

*Canonical backlog for remaining build-out. Product business rules: Part 1 above. Pipeline definitions: [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.0.*


