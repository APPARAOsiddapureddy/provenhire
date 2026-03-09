# ProvenHire Product Documentation (Deep Dive)

This is the complete product-level documentation for ProvenHire.  
It explains what the website does, point-by-point, for every role, every major screen, and every critical backend flow.

---

## 1. Product Purpose

ProvenHire is a skill-verification-first hiring platform.  
Its core promise is:

- move hiring from resume-claims to evidence-based signals
- verify candidates through structured stage pipelines
- expose recruiters to a higher-trust talent pool
- support multi-role operations (job seekers, recruiters, experts, admins)

---

## 2. Role Model and Access Model

## 2.1 User roles

- `jobseeker`
- `recruiter`
- `expert_interviewer`
- `admin`

## 2.2 Route protection

Protected routes are guarded by `ProtectedRoute` and role checks:

- job seeker pages are inaccessible to recruiters/experts/admin
- recruiter pages are inaccessible to job seekers/experts/admin
- expert pages are inaccessible to job seekers/recruiters/admin
- admin has separate login and dashboard

If role mismatch happens, user is redirected to their own dashboard.

---

## 3. Frontend Route Map (User-Facing)

## 3.1 Public routes

- `/` – Home/Landing page
- `/auth` – Sign in / Sign up / Forgot / Reset
- `/jobs` – Public job browsing page (with role-sensitive actions if logged in)
- `/about` – About page
- `/for-employers` – Recruiter-focused landing page
- `/careers/interviewer` – Expert interviewer application page
- `/admin` – Admin login

## 3.2 Protected routes

- `/dashboard/jobseeker`
- `/verification`
- `/dashboard/recruiter`
- `/dashboard/recruiter/onboarding`
- `/dashboard/recruiter/assignmentai`
- `/post-job`
- `/candidate-search`
- `/dashboard/expert`
- `/interview/room/:sessionId`
- `/admin/dashboard`

## 3.3 Not found

- `*` -> `NotFound` page.

---

## 4. Authentication and Identity Flows

## 4.1 Sign up flow

User can sign up via `/auth?mode=signup`.

### Job seeker sign up

- enters email + password + confirm password
- chooses track:
  - `Technical` (5-stage verification)
  - `Non-Technical` (3-stage verification)
- account created via `/api/auth/register`
- role stored as `jobseeker`, roleType stored as `technical` or `non_technical`

### Recruiter sign up

- enters email + password + confirm password
- enters company name + company size
- account created via `/api/auth/register`
- recruiter profile saved via `/api/users/recruiter-profile`

## 4.2 Sign in flow

On `/auth?mode=login`:

- user enters email/password
- `/api/auth/login` returns JWT (+ refresh token)
- app stores token and fetches role via `/api/auth/me`
- redirect:
  - recruiter -> `/dashboard/recruiter`
  - job seeker -> `/dashboard/jobseeker`
  - expert -> `/dashboard/expert`
  - admin -> `/admin/dashboard`

## 4.3 Forgot password flow

From login screen, user can click **Forgot password**:

- `/auth` switches to mode `forgot`
- user enters email
- `/api/auth/forgot-password` is called
- success toast is shown (whether or not account exists, for privacy-safe UX)

## 4.4 Reset password flow

Reset link brings user to `/auth?mode=reset&token=...&email=...`

- user sets new password + confirm
- token is validated server-side by `/api/auth/reset-password`
- on success, user is redirected to login with reset success indicator

## 4.5 Change password while logged in

Available in dashboards:

- current password + new password
- `/api/auth/change-password`

## 4.6 Session bootstrapping and refresh

- app checks token at startup (`/api/auth/me`)
- refresh endpoint `/api/auth/refresh` is used on 401 retry path
- sign-out clears auth and returns to home

---

## 5. Public Website Experience

## 5.1 Home page (`/`)

Core messaging:

- skill-certified hiring
- multi-stage verification
- trust and speed claims

Major sections include:

- hero CTA (jobs/auth)
- verification explanation
- stage-preview cards
- proctoring/trust explanation
- recruiter/job seeker calls-to-action

## 5.2 Jobs page (`/jobs`)

Public users can:

- search/filter/sort jobs
- browse technical and non-technical roles

Logged-in job seekers can:

- save/unsave jobs
- apply to jobs
- upload resume if needed
- submit assignment response for assignment-required non-tech jobs

Important behavior:

- track-match enforcement:
  - non-technical seekers can only apply/save non-tech jobs
  - technical seekers can only apply/save technical jobs
- certain premium/locked opportunities are visually gated by verification status

---

## 6. Job Seeker Product (Dashboard + Verification)

## 6.1 Job Seeker Dashboard (`/dashboard/jobseeker`)

Primary sections:

- **Verification Pipeline**
- **Skill Passport**
- **Applications**

### Verification pipeline UI

- shows stage cards by track:
  - technical: 5 cards
  - non-technical: 3 cards
- status-aware CTA:
  - start
  - retry
  - locked
  - completed

### Applications section

- user applications
- saved jobs
- remove saved jobs
- quick navigate to jobs

### Profile controls

- edit profile fields
- add/remove skills
- reset password
- sign out

## 6.2 Verification engine overview

Verification is stage-based with states:

- `locked`
- `in_progress`
- `completed`
- `failed`

Stage data is loaded from `/api/verification/stages` and reconciled with current role path.

### Technical path

1. profile setup
2. aptitude test
3. DSA round
4. AI expert interview
5. human expert interview

### Non-technical path

1. profile setup
2. non-tech assignment
3. human expert interview

## 6.3 Stage behavior details

### Profile setup

- saves structured profile data (`/api/users/job-seeker-profile`)
- roleType and target job title drive downstream track/path behavior

### Aptitude test

- loads server-issued questions session
- submits answers to `/api/verification/aptitude`
- stage status updated via `/api/verification/stages/update`
- supports retake/reset
- includes proctoring + risk monitor

### DSA round

- coding questions, language templates, run tests via `/api/execute`
- final submission to `/api/verification/dsa`
- stage update via `/api/verification/stages/update`
- supports retake/reset
- includes proctoring + risk monitor

### AI expert interview (technical)

- starts interview session via `/api/interview/start`
- answer loop via `/api/interview/respond`
- interview scoring persisted server-side
- stage completion triggers technical scorecard/shortlisting logic

### Non-tech assignment

- prompt shown based on target role
- user submits response to `/api/verification/non-tech-assignment/submit`
- AI evaluation returns:
  - score
  - qualified/not-qualified
  - summary/strengths/gaps
- human interview unlock is conditional on qualification

### Human expert interview

- job seeker sees matched interviewers and slots
- books slot via `/api/verification/book-slot`
- session managed through meeting link flow
- final pass/fail recorded by expert evaluator

---

## 7. Technical Scoring and Shortlisting (Current Engine)

Server-side scorecard endpoint:

- `GET /api/verification/technical-scorecard`

Score object includes:

- aptitude_score
- dsa_score
- ai_interview_score
- integrity_score
- final_score
- confidence_score
- ranking_score
- qualification_band
- risk_level
- candidate_status
- gate_1_passed, gate_2_passed
- human_review_required

### Composite formula

`final = aptitude*0.25 + dsa*0.35 + ai*0.30 + integrity*0.10`

### Gate model

- Gate 1: minimum competency
  - aptitude >= 55
  - dsa >= 60
  - ai >= 60
- Gate 2:
  - final >= 70
- Integrity override:
  - integrity < 50 => `integrity_risk` and manual review required

### Confidence/ranking

- confidence penalized by retries, risk, and cross-stage variance
- ranking score = `final * (confidence/100)`

---

## 8. Proctoring and Integrity System

## 8.1 Consent gate

Before tests begin, candidate must explicitly accept:

- camera required
- mic required
- fullscreen required
- no tab switching

## 8.2 Runtime monitoring

Risk monitor tracks violations and logs events:

- tab/window/fullscreen events
- copy-paste / right-click / devtools attempts
- face presence / multiple faces / looking away
- visibility quality
- audio anomaly patterns

Events are sent to `/api/proctoring/alerts` and stored in `ProctoringEvent`.

## 8.3 Integrity scoring

Integrity score is derived from event deductions and used in final technical shortlisting.

---

## 9. Recruiter Product

## 9.1 Recruiter onboarding (`/dashboard/recruiter/onboarding`)

Recruiter must complete profile details:

- designation
- phone
- company website
- industry
- hiring for

Saved through `/api/users/recruiter-profile` with `onboardingCompleted`.

## 9.2 Recruiter dashboard (`/dashboard/recruiter`)

Key modules:

- talent discovery cards
- recruiter stats
- recruiter-posted jobs list
- incoming applications
- status updates (applied/reviewing/interview/etc.)

Primary APIs:

- `/api/jobs/recruiter`
- `/api/jobs/recruiter/applications`
- `/api/jobs/applications/:id/status`

## 9.3 Post job (`/post-job`)

Recruiter creates jobs with:

- title/company/description/location/type/salary
- job track (`tech` or `non_technical`)
- optional assignment content for non-tech roles

API: `/api/jobs` (POST)

## 9.4 Candidate search (`/candidate-search`)

Recruiter can:

- filter candidates by skills/experience/verification
- view profile details
- inspect skill passport data
- express interest in verified candidates

Primary APIs:

- `/api/users/candidates`
- `/api/notifications/contact-candidate`

## 9.5 AssignmentAI docs page

- `/dashboard/recruiter/assignmentai`
- renders markdown docs for assignment generation workflow (`/docs/assignmentai.md`)

---

## 10. Expert Interviewer Product

## 10.1 Expert dashboard (`/dashboard/expert`)

Core blocks:

- pending candidates (role-matched)
- schedule management
- stats (conducted/passed/pass rate)
- available slots
- upcoming sessions
- past sessions

Primary APIs:

- `/api/expert/pending-candidates`
- `/api/expert/slots` (create/delete)
- `/api/expert/schedule-interview`
- `/api/expert/sessions/upcoming`
- `/api/expert/sessions/past`
- `/api/expert/stats`

## 10.2 Interview room (`/interview/room/:sessionId`)

Expert uses room view to:

- join scheduled session
- open meeting link
- submit structured evaluation scores

Evaluation endpoint:

- `/api/expert/sessions/:id/evaluate`

Pass/fail updates:

- human_expert_interview stage status
- final profile verification status update

---

## 11. Admin Product

## 11.1 Admin dashboard (`/admin/dashboard`)

Tabbed/admin modules include:

- platform stats
- job seekers list
- recruiters list
- jobs list
- applications
- proctoring review
- realtime proctoring alerts
- proctoring analytics
- appeals manager
- newsletter subscribers
- interviewer applications
- broadcast messaging
- CSV user export
- destructive user delete + blocked email safeguard

## 11.2 Interviewer application management

Admin can:

- approve interviewer applications
- reject interviewer applications

Approval flow creates:

- User (`expert_interviewer` role)
- Interviewer profile
- set-password invite token email

---

## 12. Notification System

Core capabilities:

- user notification inbox
- mark-as-read
- admin broadcast messaging
- job alert subscription settings

Main endpoints:

- `/api/notifications`
- `/api/notifications/read`
- `/api/notifications/admin-message`
- `/api/notifications/job-alerts`

---

## 13. API Surface by Domain

## 13.1 Auth

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/refresh`
- `/api/auth/me`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`
- `/api/auth/change-password`

## 13.2 Users

- `/api/users/me`
- `/api/users/job-seeker-profile` (GET/POST)
- `/api/users/recruiter-profile` (GET/POST)
- `/api/users/candidates`

## 13.3 Jobs

- `/api/jobs` (list/create)
- `/api/jobs/:id/apply`
- `/api/jobs/:id/save` (POST/DELETE)
- `/api/jobs/me/applications`
- `/api/jobs/me/saved`
- `/api/jobs/recruiter`
- `/api/jobs/recruiter/applications`
- `/api/jobs/applications/:id/status`

## 13.4 Verification

- `/api/verification/stages` and related update/reset/bulk routes
- `/api/verification/aptitude*`
- `/api/verification/dsa*`
- `/api/verification/non-tech-assignment/submit`
- `/api/verification/technical-scorecard`
- human interview booking/matching/session routes

## 13.5 Interview

- `/api/interview/start`
- `/api/interview/respond`
- `/api/interview/latest`
- `/api/interview/:id/result`

## 13.6 Proctoring

- `/api/proctoring/alerts` (POST/GET)
- `/api/proctoring/alerts/read`

## 13.7 Expert

- `/api/expert/*` for slots, sessions, pending candidates, evaluations

## 13.8 Admin

- `/api/admin/*` for stats, lists, approvals, exports, notifications

---

## 14. Data Model (High-Level Product Entities)

Major persisted entities:

- `User`
- `JobSeekerProfile`
- `RecruiterProfile`
- `Job`
- `JobApplication`
- `SavedJob`
- `VerificationStage`
- `AptitudeTestResult`
- `DsaRoundResult`
- `Interview` + `InterviewMessage`
- `HumanInterviewSession`
- `InterviewerApplication`
- `Interviewer` + `InterviewerSlot`
- `ProctoringEvent`
- `Notification`
- `Appeal`

---

## 15. Error Handling and UX Safeguards

Patterns used across product:

- strong form validation (frontend + zod backend)
- role mismatch redirect
- optimistic state updates with fallback toasts
- load timeout handling for verification/dashboard API calls
- missing/inaccessible stage data recovery
- retry affordances for failed stages
- clear destructive action confirmations in admin zones

---

## 16. Security and Authorization Model

Core controls:

- JWT auth + refresh token flow
- route-level role middleware (`requireAuth`, `requireAdmin`, expert guard)
- frontend `ProtectedRoute` role checks
- track-match restrictions for apply/save job actions
- admin-only sensitive endpoints
- password reset token hashing and expiry

---

## 17. External Integrations

- Gemini (AI parsing/evaluation/generation)
- Judge0 (code execution sandbox)
- Resend (email notifications/invites/password reset)
- Prisma + SQL database

Fallback principles:

- if AI unavailable, product falls back where possible with safe defaults
- if external executor unavailable, explicit error returned for coding run

---

## 18. Product Update Guide (Scale-Ready)

This section explains how to extend the product cleanly.

## 18.1 Adding a new verification stage

1. Add stage name to frontend stage order (`VerificationFlow` + dashboards)
2. Ensure backend `verification` routes include it in initialization/reset
3. Add stage UI component in `src/pages/verification/stages/`
4. Add stage scoring contribution (if technical scorecard relevant)
5. Add proctoring requirements if assessment stage
6. Update docs and admin reporting mappings

## 18.2 Adding a new user role

1. Add role to user role enum/types
2. Add role-specific dashboard route + protected guard mapping
3. Add backend role middleware behavior
4. Add onboarding + profile schema
5. Update notifications and admin lists
6. Add routing fallback redirects in auth + protected route

## 18.3 Scaling candidate scoring

1. Keep scoring formulas server-side only
2. Version formulas in one place (`verificationScoring.service`)
3. Record component signals in persisted metadata for auditability
4. Add explainable sub-scores to admin and recruiter UIs
5. Introduce offline recalculation scripts for historical migrations

## 18.4 Scaling proctoring

1. Keep event taxonomy stable (`event_code` registry)
2. Add new detectors behind feature flags
3. Normalize severity + deduction mapping centrally
4. Store raw details but expose redacted summaries to non-admin roles
5. Add retention and archival policy for proctoring events

## 18.5 Operational and release checklist

- verify role-based routing
- run stage reset/regression tests
- verify scoring endpoint contracts
- verify dashboard cards for both tracks
- verify admin alert ingestion
- verify email templates/tokens
- verify migration safety and backwards compatibility

---

## 19. Known Functional Boundaries (Current)

Important current-state notes:

- some notification endpoints are placeholders returning `{ ok: true }`
- contact-candidate currently acknowledges request but can be extended for richer workflows
- screenshot detection is heuristic-limited by browser restrictions
- certain scoring components use heuristics where full telemetry is not yet stored

These are intentional extension points for future product maturity.

---

## 20. Recommended Next Documentation Set

To support enterprise-scale product evolution, maintain these companion docs:

1. **API Contract Spec** (`OpenAPI` style)
2. **Data Dictionary** (all tables/fields/ownership)
3. **RBAC Matrix** (role x action x endpoint)
4. **Scoring Formula Versioning Doc**
5. **Incident Runbooks** (auth outage, scoring outage, proctoring outage)
6. **Release Checklist Template**

---

## 21. Final Summary

ProvenHire today is a multi-role, verification-first hiring platform with:

- clear role-separated experiences
- end-to-end candidate verification pipelines
- server-side scoring and integrity-weighted qualification
- recruiter discovery and application operations
- expert interview scheduling/evaluation operations
- admin governance, moderation, and analytics tooling

This documentation is designed to be the foundational blueprint for scaling the product without losing correctness, fairness, or system clarity.

