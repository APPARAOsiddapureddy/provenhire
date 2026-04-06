# ProvenHire — Product Requirements Document (PRD)

**Version:** 6.3  
**Last Updated:** April 2026  
**Status:** Current

---

## 1. Executive Summary

ProvenHire is India's first skill-certified hiring platform that connects verified talent with employers. Job seekers prove their skills through a rigorous 5-stage verification process; recruiters access a pool of pre-verified candidates; expert interviewers conduct human interviews as neutral third parties.

### Core Value Proposition

| Stakeholder | Value |
|-------------|-------|
| **Job Seekers** | Get verified through aptitude, DSA, AI interview, and human expert interview. Carry a Skill Passport. Stand out to employers. |
| **Recruiters** | Access pre-verified candidates, post jobs for free, AI-powered matching, reduce time-to-hire by 60%. |
| **Expert Interviewers** | Conduct Stage 5 human interviews, flexible schedule, earn per interview, shape future talent. |

---

## 2. User Roles

| Role | Description | Access |
|-----|-------------|--------|
| **jobseeker** | Candidates seeking jobs | Verification flow, Job search, Applications, Dashboard |
| **recruiter** | Employers posting jobs | Post jobs, Candidate search, Recruiter dashboard |
| **admin** | Platform administrators | Admin dashboard, Job seeker/recruiter management, Interviewer applications |
| **expert_interviewer** | Third-party interviewers | Expert dashboard, Slot management, Interview room, Evaluations |

---

## 3. Verification Flow

### 3.1 Technical Track (5 Stages)

| Stage | Name | Description | Pass Criteria |
|-------|------|-------------|---------------|
| 1 | Profile Setup | Resume upload, AI analysis, profile completion | Profile saved |
| 2 | Aptitude Test | 20 MCQs (verbal + quant/logical), **30-minute** timed test; server enforces window from session start | **≥ 60%** of weighted marks to pass; UI shows **percentage** (e.g. 72%); raw marks stored in `AptitudeTestResult`, **0–100** in stage/skill rows — see `docs/PRD_VERIFICATION_SCORING.md` |
| 3 | DSA Round | Coding challenges, problem-solving | Score recorded |
| 4 | AI Expert Interview | Structured AI-led technical interview | Score recorded |
| 5 | Human Expert Interview | Live video interview with expert interviewer | Pass ≥70% |

**Shortlisting (Stage 4 → 5):** Combined technical blend **Stage 2: 25%, Stage 3: 35%, Stage 4: 40%** (each arm is a **0–100** sub-score from the scorecard). **`final_score ≥ 65`** plus per-stage floors (aptitude ≥ 55, DSA ≥ 60, AI interview ≥ 60) unlocks Stage 5 — see `buildTechnicalScorecard()` / `docs/PRD_VERIFICATION_SCORING.md`.

### 3.2 Non-Technical Track (3 Stages)

| Stage | Name |
|-------|------|
| 1 | Profile Setup |
| 2 | Non-Tech Assignment |
| 3 | Expert Interview |

No Stage 5 (Human Expert Interview) for non-technical track.

### 3.3 Verification Status

- `pending` — In progress
- `verified` — All stages passed (technical: through Stage 4 or 5)
- `expert_verified` — Passed Stage 5 human expert interview

### 3.4 AI Expert Interview (Stage 4) — Specification & implementation status

This section is the **single place** in the main PRD for what the AI interview is supposed to do, what is live in the product today, and what remains open. The **full product specification** (Pro Upgrade §§1–10, adversarial engine §11, voice §12, v2 APIs §13–15) lives in **`docs/PRD_AI_INTERVIEW_ROUND.md` (v3.0)**; **codebase vs spec** is tracked there in **§16**.

#### 3.4.1 Purpose and learner promise

- **Goal:** A structured, **voice-first**, technical interview that feeds the verification scorecard (**40%** of the technical blend with Stages 2–3; see §3.1 and `buildTechnicalScorecard()`).
- **Format (live product):** **Adversarial v2** — three **sprints** (Project Defense → Foundations → System Design), up to **15** total exchanges, with dynamic follow-ups (weakness / discrepancy / reasoning probes) driven by Gemini.
- **Trust:** Camera and tab/proctoring signals are required during the session; outcomes can be flagged for admin review when integrity or anti-gaming rules fire.

#### 3.4.2 Interview engines in the codebase

| Track | Entry | Behavior |
|-------|--------|----------|
| **Primary (verification UI)** | `POST /api/interview/v2/start`, `POST /api/interview/v2/turn`, `POST /api/interview/v2/partial` | Orchestrator in `server/src/services/interview/orchestrator.ts`: sprint personas, static openers per sprint, `processTurn` / agents for follow-ups and final evaluation. Front end: `src/pages/verification/stages/ExpertInterviewStage.tsx`. |
| **Legacy / question-plan** | `POST /api/interview/start`, `POST /api/interview/respond`, etc. | Older linear plan with optional **`QUESTION_BANK_SOURCE=db`** (`InterviewQuestionBank`). Still present for compatibility; the verification flow uses **v2** for the AI Expert Interview stage. |

#### 3.4.3 Voice, TTS, and environment

| Capability | Implemented | Notes |
|------------|-------------|--------|
| **Speech-to-text (live)** | Yes | **Deepgram** WebSocket when `DEEPGRAM_API_KEY` is set; otherwise **Web Speech API** (Chrome/Edge) with live partials and `/v2/partial` prefetch. Hook: `src/hooks/useDeepgramSession.ts`. |
| **TTS (question + fillers)** | Yes | **ElevenLabs** streaming MP3 when `ELEVENLABS_API_KEY` (and voice id) set; otherwise **`speechSynthesis`** fallback. Routes: `GET/POST` patterns under `server/src/routes/interview.ts` (`/tts`, `/tts-filler`). |
| **Whisper / post-hoc STT on audio** | No | Not in the v2 voice path; gap vs older gap-analysis doc for “upload then transcribe” pipelines. |
| **5s review / edit transcript before send** | No | Spec’d in `PRD_AI_INTERVIEW_ROUND.md` §5 for typed+voice hybrid; v2 is continuous voice turn submission without that gate. |
| **Typed answer toggle** | No | v2 is voice-primary only from the candidate side during the live session. |

**Production checklist (operator):** set `GEMINI_API_KEY`, optional `DEEPGRAM_API_KEY`, optional `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` on the API service so candidates get cloud STT/TTS instead of browser-only fallbacks.

#### 3.4.4 Proctoring, anti-gaming, and integrity

| Area | Status | Implementation pointers |
|------|--------|-------------------------|
| Tab switch, fullscreen, copy/paste, devtools (feature flags) | Live | `useProctoringRiskMonitor` in `ExpertInterviewStage`; events logged per session. |
| Face / phone hints | Live | `useFaceAndPhoneDetection` with optional server `STOP_TEST` when strict. |
| Session labels (baseline / elevated / high attention) | Live | Driven by logged violation counts, not a single “risk score” as the learner-facing number. |
| Anti-gaming scoring | Partial / live | `analyzeAnswerAntiGaming` and merge into `integrityFlag` / interview outcome (see `interview.ts` + services). |
| Admin override + `ProctoringReviewLog` | Per extended PRD | Model/checklist in `PRD_AI_INTERVIEW_ROUND.md`; confirm admin UI coverage separately. |
| **`pending_review`** when Gemini eval fails | Partial | Canonical fallback and admin re-eval are spec’d in `PRD_AI_INTERVIEW_ROUND.md` §3; wire-up should be verified per release. |

#### 3.4.5 Scoring, shortlist, and what the candidate sees

- **Per-session score:** v2 completion returns `totalScore`, `badgeLevel`, and structured **`evaluation`** (verdict, strengths, weaknesses) consistent with `evaluateFullInterview` / aggregates.
- **Shortlist gate:** Stage 4 contributes **0–100** into the technical scorecard; combined blend and floors (e.g. AI interview **≥ 60**) — §3.1.
- **Candidate explainability:** Completion UI shows badge, score, verdict, strengths, and improvement bullets — aligned with §7 of the extended PRD where implemented; **per-question breakdown** remains admin-only per spec.

#### 3.4.6 API surface (AI interview, v2 + media)

| Method | Path | Role |
|--------|------|------|
| POST | `/api/interview/v2/start` | Create session + first sprint question (auth, job seeker). |
| POST | `/api/interview/v2/turn` | Submit answer (`inputMode: voice`), receive next question or completion. |
| POST | `/api/interview/v2/partial` | Optional prefetch while user is still speaking. |
| GET | `/api/interview/deepgram-token` | Returns `{ token }` or `{ token: null }` for browser STT fallback. |
| POST | `/api/interview/tts` | MP3 stream or JSON `{ fallback: true }` for browser TTS. |
| GET | `/api/interview/tts-filler` | Short filler line while model thinks. |

#### 3.4.7 Implementation status matrix (summary)

| Item | Status |
|------|--------|
| 3-sprint adversarial v2 flow | Done |
| Role + experience level on start | Done |
| Cloud STT/TTS + browser fallbacks | Partial — ElevenLabs + Deepgram live; **Cartesia** (spec §12) not yet; Deepgram model **nova-2** in client until **nova-3** (see `PRD_AI_INTERVIEW_ROUND.md` §16) |
| Camera + proctoring hooks + face/phone | Done |
| Final Gemini evaluation + badge/score UI | Done |
| Question bank DB + admin CRUD | Partial (schema + legacy plan path; not driving v2 orchestrator) |
| Per-question `InterviewQuestionResult` rows | Partial / verify against v2 finalize path |
| Transcript confidence + edit window + typed mode | Not done (v2) |
| Whisper on recorded audio | Not done |
| Async queue (BullMQ) for STT/eval | Not done |
| Full admin pending-review + re-eval UX | Partial — see extended PRD |

#### 3.4.8 Target UI/UX (product direction)

The live screen should read as **voice-first**, not a static form. Recommended patterns (many can ship incrementally):

1. **Split layout (large viewports):** Proctoring + camera in one column; **question + voice hub** in the other so the question is not a thin band lost in empty space.
2. **Sprint strip:** Always show three sprint markers and highlight the active sprint so “where am I?” is obvious.
3. **Voice hub:** Large state pill (**Listening / AI speaking / Thinking**), visible **mic level** when listening, and a **Replay question** control (TTS again) when audio was missed or blocked.
4. **Secondary cues:** Live transcript line (“You said…”) when partial STT is available; optional subtle **speaker** icon animation during TTS.
5. **Camera:** Clear “Preview on” / “Required for session” copy; avoid a black box with only a tiny icon.
6. **Accessibility:** Keyboard target for replay; respect `prefers-reduced-motion` for pulsers.

Detailed task checklist and data model notes remain in **`docs/PRD_AI_INTERVIEW_ROUND.md`** and **`docs/AI_INTERVIEW_GAP_ANALYSIS.md`**.

---

## 4. Expert Interviewer Module

### 4.1 Careers Page (`/careers/interviewer`)

**Purpose:** Recruitment of interviewers who will conduct Stage 5 human expert interviews.

**Audience:** Professionals who want to **conduct** interviews — not job seekers or employers.

**Features:**
- Clarity banner: "This page is for professionals who want to conduct interviews"
- Hero with graphic (interviewer + candidate)
- Application form: Name, Email, Experience years, Track (technical/non-technical), Domains, LinkedIn, Why join
- "Not for you?" links: Find Jobs | For Employers

**API:** `POST /api/interviewer-application`

### 4.2 Admin: Interviewer Applications

**Location:** Admin Dashboard → Interviewer Apps tab

**Features:**
- List all applications (pending, approved, rejected)
- Approve & Invite: Creates User (role=expert_interviewer), creates Interviewer profile, sends set-password link
- Reject: Marks application rejected

**APIs:**
- `GET /api/admin/interviewer-applications`
- `POST /api/admin/interviewer-applications/:id/approve`
- `POST /api/admin/interviewer-applications/:id/reject`

### 4.3 Expert Dashboard (`/dashboard/expert`)

**Purpose:** Focused panel for interviewers — no Find Jobs, Employers, Careers, About navigation.

**Features:**
- **Stats:** Interviews conducted, Candidates passed, Pass rate
- **My Availability:** Add slot (date + time, 45 min), Bulk add slots, Delete slots
- **Upcoming Interviews:** Scheduled sessions with "Join interview" button
- **Past Interviews:** Completed sessions with Pass/Fail badge
- **Profile:** Email, track, domains

**Navigation:** Minimal navbar (Logo → /dashboard/expert, Dashboard, Notifications, Sign out). Minimal footer.

**APIs:**
- `GET /api/expert/profile` — Profile + future slots
- `GET /api/expert/stats` — Conducted, passed, pass rate
- `POST /api/expert/slots` — Add slot
- `DELETE /api/expert/slots/:id` — Remove slot
- `GET /api/expert/sessions/upcoming`
- `GET /api/expert/sessions/past`

### 4.4 Interview Room (`/interview/room/:sessionId`)

**Purpose:** Conduct the interview and submit evaluation.

**Features:**
- Candidate profile (name, experience, college, role, skills)
- Video call link: Paste Zoom/Google Meet URL, save for candidate to join
- Evaluation form: 6 dimensions (0–100 each), notes
- Submit evaluation → Pass (≥70%) or Fail

**Evaluation Weights:**
- Technical Depth: 30%
- Problem Solving: 20%
- Authenticity: 15%
- Real-World Exposure: 15%
- System Thinking: 10%
- Communication: 10%

**APIs:**
- `GET /api/expert/sessions/:id` — Session detail
- `PATCH /api/expert/sessions/:id` — Update meeting link
- `POST /api/expert/sessions/:id/evaluate` — Submit evaluation

---

## 5. Matching & Booking

### 5.1 Matching Logic

- Interviewers matched by track (technical / non_technical)
- Job seeker's `roleType` (technical / non_technical) determines matched interviewers
- Only interviewers with `status=active`, linked `userId`, and available slots shown

### 5.2 Booking Flow (Job Seeker)

1. Job seeker reaches Stage 5 (Human Expert Interview)
2. Fetches matched interviewers with available slots
3. Selects slot → Books
4. Session created, slot marked booked
5. Candidate sees "Interview scheduled" with meeting link when interviewer adds it

**APIs:**
- `GET /api/verification/matched-interviewers` — Matched interviewers + slots
- `GET /api/verification/human-interview-session` — Current session (if booked)
- `POST /api/verification/book-slot` — Book slot

---

## 6. Data Models

### 6.1 User & Roles

```
User (id, email, passwordHash, role, name)
  role: jobseeker | recruiter | admin | expert_interviewer
```

### 6.2 Interviewer Lifecycle

```
InterviewerApplication (name, email, experienceYears, track, domains, status)
  status: pending | approved | rejected

Interviewer (userId, name, domain, track, domains, experienceYears, status)
  track: technical | non_technical
  status: active | inactive

InterviewerSlot (interviewerId, startsAt, endsAt, status, bookedUserId)
  status: available | booked

HumanInterviewSession (userId, interviewerId, slotId, scheduledAt, meetingLink,
  evaluationScores, evaluationNotes, evaluationPass, evaluationSubmittedAt)
```

### 6.3 Verification

```
VerificationStage (userId, stageName, status, score)
  stageName: profile_setup | aptitude_test | dsa_round | expert_interview | human_expert_interview
  status: locked | in_progress | completed | failed
  score: For aptitude_test after submit, **0–100 (percent)**; for dsa_round and expert_interview, **0–100**; raw aptitude marks live on AptitudeTestResult

JobSeekerProfile (verificationStatus, roleType)
  verificationStatus: pending | verified | expert_verified
  roleType: technical | non_technical
```

### 6.4 Proctoring & integrity signals

- **Violation counts (source of truth):** Each integrity signal type (tab switch, fullscreen exit, face issues, etc.) is tracked by **how many times** it was logged for the session (after server-side / client rate limits), not by a cumulative weighted “risk score.”
- **Persistence:** `ProctoringEvent.riskScore` stores the **1-based violation index for that signal type** in that session at log time. Full snapshots can live in `details` / `violationDetails`.
- **Interview row:** `Interview.riskScore` stores the **number of proctoring alert rows** for that AI interview session (for sorting/visibility). `integrityFlag` still captures review tiers; see `docs/PRD_AI_INTERVIEW_ROUND.md` §6.
- **Learner UI:** Shows session labels driven by total logged violations and repeat counts (e.g. Baseline / Elevated / High attention), not a numeric risk score.

---

## 7. User Flows

### 7.1 Job Seeker (Technical Track)

```
Sign Up → Profile Setup → Aptitude Test → DSA Round → AI Interview
  → Shortlist check (≥65%) → Human Expert Interview (book slot)
  → Attend interview (join meeting link) → Get expert_verified
  → Browse jobs, apply
```

### 7.2 Expert Interviewer

```
Apply at /careers/interviewer → Admin approves → Set password (invite link)
  → Login → Expert Dashboard → Add slots → Job seeker books
  → Join Interview → Add meeting link → Conduct call → Submit evaluation
```

### 7.3 Recruiter

```
Sign Up → Recruiter Dashboard → Post jobs → Search candidates
  → View verified talent → Contact applicants
```

### 7.4 Admin

```
Login → Admin Dashboard → Manage job seekers, recruiters
  → Interviewer Apps tab → Approve/Reject applications → Send invite link
```

---

## 8. Routes & Access

| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Landing |
| `/auth` | Public | Login / Sign up |
| `/jobs` | Public | Job listings |
| `/jobs/:seoSlug` | Public | Programmatic SEO (whitelist slugs only) |
| `/skills/:skillSlug` | Public | Programmatic SEO — skill × jobs intent |
| `/about` | Public | About |
| `/for-employers` | Public | Employer marketing |
| `/for-recruiters`, `/for-job-seekers`, `/features`, `/resources`, `/blog` | Public | SEO hubs & core money pages |
| Many `/hire-*`, `/skill-*`, `/no-resume-hiring`, etc. | Public | Feature / use-case / pillar SEO (see `src/data/seoArchitecture.ts`) |
| `/careers/interviewer` | Public | Interviewer application |
| `/verification` | Job seeker | Verification flow |
| `/dashboard/jobseeker` | Job seeker | Job seeker dashboard |
| `/dashboard/recruiter` | Recruiter | Recruiter dashboard |
| `/dashboard/expert` | Expert interviewer | Expert dashboard |
| `/interview/room/:sessionId` | Expert interviewer | Interview room |
| `/post-job` | Recruiter | Post job |
| `/candidate-search` | Recruiter | Search candidates |
| `/admin/dashboard` | Admin | Admin panel |

---

## 9. Navigation by Role

### Job Seeker / Guest
- Find Jobs, Job Seekers, For Employers (hidden), Recruiters (hidden), Resources, Careers, About

### Recruiter
- Find Jobs (hidden), Job Seekers, For Employers, Recruiters, Resources, Careers, About

### Expert Interviewer
- **Minimal:** Logo, Dashboard, Notifications, Sign out only (no Find Jobs, Employers, Careers, About)

### Admin
- Full nav as applicable

---

## 10. Test Credentials (E2E / QA)

Seeds create users in **the database referenced by your `DATABASE_URL`** (local or Render). Production login will fail until you run these against the **production** Postgres from **Render Shell** (or equivalent).

**Shared QA password (current seeds):** `PhE2E_Apr2026!x7`

| Role | Email | Seed command |
|------|-------|----------------|
| Job seeker — aptitude stage | `qa.apt.apr2026@test.provenhire.com` | `npm run seed:test-credentials` |
| Job seeker — DSA stage | `qa.dsa.apr2026@test.provenhire.com` | (same) |
| Job seeker — AI interview stage | `qa.ai.apr2026@test.provenhire.com` | (same) |
| Job seeker — AI interview (second) | `qa.ai2.apr2026@test.provenhire.com` | (same) |
| Expert interviewer | `qa.expert.apr2026@test.provenhire.com` | `npm run seed:interviewer` |
| Recruiter | `qa.recruiter.apr2026@test.provenhire.com` | `npm run seed:recruiter` |
| Admin | `admin@test.provenhire.com` | `Admin123456` — `npm run seed:admin` (see deployment docs) |

From repo: `cd server`, then `npx prisma migrate deploy` if needed, then the `npx tsx prisma/seed-*.ts` commands above. Details: **`docs/README.md`**, **`server/.env.example`**.

---

## 11. Non-Functional Requirements

- **Security:** JWT auth, role-based access, protected routes; auth rate limits; hardened CORS and headers on API (see deployment docs)
- **Responsive:** Mobile-friendly UI
- **Performance:** Lazy loading for heavy routes
- **Accessibility:** Semantic HTML, ARIA where needed

---

## 12. Future Considerations

- Email delivery for interviewer invite (currently link copy-paste)
- In-app video call integration (currently external Zoom/Meet link)
- Interviewer compensation tracking
- Non-technical track Stage 5 (human expert) if needed

---

*PRD v6.3 — April 2026*
