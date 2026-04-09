# ProvenHire — Product Requirements Document (PRD)

**Version:** 6.7 (single consolidated document)  
**Last Updated:** April 2026  
**Status:** Current
**Implementation drift log:** [IMPLEMENTATION_CHANGELOG.md](IMPLEMENTATION_CHANGELOG.md)

This file is the **only product PRD**: candidate verification, recruiter flows, revenue and limits, engineering backlog, and the full AI Expert Interview specification.

**How to navigate:** Use your editor outline or GitHub’s auto-generated TOC. Parts are separated by horizontal rules.

---

## Table of contents (Parts)

| Part | Content |
|------|---------|
| **A — Candidate platform** | §§1–… Executive summary through routes, scoring, DSA, expert interviewer — *starts at [§1 Executive summary](#1-executive-summary)* |
| **B — Recruiter** | *[PRD: Recruiter — Complete Product Requirements](#prd-recruiter--complete-product-requirements)* |
| **C — Business & backlog** | *[PRD — Business rules & engineering backlog](#prd--business-rules--engineering-backlog)* |
| **D — AI Expert Interview** | *[PRD — AI Expert Interview (full specification)](#prd--ai-expert-interview-full-specification)* |

---

## 1. Executive Summary

ProvenHire is India's first skill-certified hiring platform that connects verified talent with employers. Job seekers prove their skills through a rigorous 5-stage verification process; recruiters access a pool of pre-verified candidates; expert interviewers conduct human interviews as neutral third parties.

### Core Value Proposition

| Stakeholder | Value |
|-------------|-------|
| **Job Seekers** | Get verified through aptitude, DSA, AI interview, and human expert interview. Carry a Skill Passport. Stand out to employers. |
| **Recruiters** | Access pre-verified candidates under **tiered subscriptions** (free / starter / growth: jobs, full-profile views, contacts, JD credits); ProvenHire Resume + discovery; reduce time-to-hire by starting with verified talent. |
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

### 3.0 Pipeline versions (`VERIFICATION_PIPELINE_V2`)

- **Legacy (default when env unset):** `profile_setup` → `aptitude_test` → `dsa_round` → `expert_interview` (AI) → `human_expert_interview` (Stage 5 human).
- **Pipeline v2 (when `VERIFICATION_PIPELINE_V2=true`):** Technical stage order is defined in `server/src/constants/verificationPipeline.ts` and enforced in `server/src/routes/verification.ts`.
  - **Default path until Profile Setup completes:** All v2 technical users see the **fresher** stage list and API `stage_order` until verification stage `profile_setup` is **completed**. `GET /api/verification/stages` then realigns rows to the track implied by `experienceYears` (mid/senior drops unused locked `cs_fundamentals`, adds `system_design_interview`, etc.). Response may include `pipeline_pending_profile_setup: true` and `verification_track: null` until then.
  - **After Profile Setup — Fresher tier** (`experienceTierFromYears` &lt; 1y): `profile_setup` → **`cs_fundamentals`** (cognitive; same submit path as legacy aptitude) → `dsa_round` → **`ai_skills_interview`** → `expert_interview` (AI Expert).
  - **After Profile Setup — Mid / Senior:** `profile_setup` → `dsa_round` → **`ai_skills_interview`** → **`system_design_interview`** → `expert_interview` (AI Expert).
- **Human expert (Stage 5)** remains a separate booking flow where enabled; naming in UI may still say "Stage 5" for the human step.

### 3.0.1 Data track (`JobSeekerProfile.roleType === "data"`)

Pipeline definitions live in **`server/src/constants/verificationPipeline.ts`** (`dataStagesForTier` / `verificationStagesForProfile`). High level:

| Tier | Stage order (verification `stage_name`) |
|------|----------------------------------------|
| **Fresher** (< 1y) | `profile_setup` → **`data_fundamentals`** → **`data_round`** → **`data_skills_interview`** → **`expert_interview`** |
| **Mid / Senior** (≥ 1y) | `profile_setup` → **`data_round`** → **`data_skills_interview`** → **`data_system_design`** → **`expert_interview`** |

**Certification (aligned with `computeProvenhireCertification`):** **L1** when **`data_round`** completes (software track still uses **`dsa_round`** for L1). **L2** when **`data_skills_interview`** completes (**and** **`data_system_design`** completes on mid/senior paths that include it). **L3** when **`expert_interview`** completes with a completed **`ai_expert`** interview row.

**AI Skills Interview (data):** Same `interviewType` **`ai_skills`** as software; stage row is **`data_skills_interview`**. Orchestration in **`aiSkillsOrchestrator.ts`** branches on track: Part A uses **Data Round** submission context (not DSA); Part B deepens **SQL / Python / stats / ML / data engineering** skills. Start/turn APIs unchanged paths; turn handler sets verification stage from profile (`data_skills_interview`).

**Data System Design:** Verification stage **`data_system_design`**; interview rows use **`interviewType: "system_design"`**. Implemented in **`server/src/services/interview/systemDesignOrchestrator.ts`** with LLD then HLD phases (typed answers + optional TTS for questions). API: **`POST /api/interview/data-system-design/start`**, **`POST /api/interview/data-system-design/turn`**, **`GET /api/interview/data-system-design/status`**. UI: **`src/pages/verification/stages/DataSystemDesignStage.tsx`**. Prerequisite: **`data_skills_interview`** completed; stage must be **`in_progress`** from verification flow.

**AI Expert Interview (data calibration):** Same v2 adversarial entry (`/api/interview/v2/*`). When `roleType === "data"`, **`orchestrator.ts`** uses data-specific sprint names/openers and passes **`dataTrack` / `dataSubtrack`** into **`generateSprintQuestion`** / **`evaluateFullInterview`** (`agents.ts`) so questions and final scoring emphasize **data pipelines, analytics, ML, and data architecture** rather than generic CRUD/API design.

**Profile subtracks (persisted):** On **`profile_setup`** completion, the API sets **`nonTechSubtrack`** and/or **`dataSubtrack`** (string enums from title detection) on **`JobSeekerProfile`**; see schema and **`detectNonTechSubtrack` / `detectDataSubtrack`** in **`verificationPipeline.ts`**.

**Engineering notes (v2 wiring):** Interview types, DSA/Data round tiers, certification levels, paid retakes/cooldowns, and recruiter limits are implemented per `PRD.md` (Part C — Business) and `IMPLEMENTATION_CHANGELOG.md`. **`system_design_interview`** (software mid/senior) may still use **`PipelineStagePlaceholder`** in **`VerificationFlow.tsx`** until a software system-design session ships; **`data_system_design`** uses the real flow above.

**Candidate monetization (retakes / cooldowns)** is defined in **`PRD.md` (Part C — Business)** and enforced server-side for paid stages and CS/DSA timing.

### 3.1 Technical Track — Legacy numbering (5 Stages)

The table below describes the **classic** five-step narrative still used in much of the UX copy; map stage **names** to your active pipeline via §3.0.

| Stage | Name | Description | Pass Criteria |
|-------|------|-------------|---------------|
| 1 | Profile Setup | Resume upload, AI analysis, profile completion | Profile saved |
| 2 | Aptitude Test | 20 MCQs (verbal + quant/logical), **30-minute** timed test; server enforces window from session start | **≥ 60%** of weighted marks to pass; UI shows **percentage** (e.g. 72%); raw marks stored in `AptitudeTestResult`, **0–100** in stage/skill rows — see `§11` (below) |
| 3 | DSA Round | Coding challenges, problem-solving | Score recorded |
| 4 | AI Expert Interview | Structured AI-led technical interview | Score recorded |
| 5 | Human Expert Interview | Live video interview with expert interviewer | Pass ≥70% |

**Shortlisting (Stage 4 → 5):** Combined technical blend **Stage 2: 25%, Stage 3: 35%, Stage 4: 40%** (each arm is a **0–100** sub-score from the scorecard). **`final_score ≥ 65`** plus per-stage floors (aptitude ≥ 55, DSA ≥ 60, AI interview ≥ 60) unlocks Stage 5 — see `buildTechnicalScorecard()` / `§11` (below).

### 3.2 Non-Technical Track (pipeline v2)

| Stage | `stage_name` (typical) |
|-------|-------------------------|
| 1 | Profile Setup (`profile_setup`) |
| 2 | **Fresher only:** Aptitude + domain MCQs (`domain_fundamentals`) |
| 3 | Role assignment / written task (`non_tech_assignment`) |
| 4 | AI Expert Interview (`expert_interview`) |

**Mid/senior** paths omit **`domain_fundamentals`** (assignment directly after profile). **L1/L2/L3** and retake rules follow non-technical PRD sections and `verificationScoring.service.ts`.

No mandatory **Human Expert Interview** stage on the default non-technical pipeline (optional product lane elsewhere).

### 3.3 Verification Status

- `pending` — In progress
- `verified` — All stages passed (technical: through Stage 4 or 5)
- `expert_verified` — Passed Stage 5 human expert interview

### 3.4 AI Expert Interview (Stage 4) — Specification & implementation status

This section is the **single place** in the main PRD for what the AI interview is supposed to do, what is live in the product today, and what remains open. The **full product specification** (Pro Upgrade §§1–10, adversarial engine §11, voice §12, v2 APIs §13–15) lives in **`PRD.md` (Part D — AI Expert Interview) Part B**; **codebase vs spec** is tracked there in **§16**.

#### 3.4.1 Purpose and learner promise

- **Goal:** A structured, **voice-first**, technical interview that feeds the verification scorecard (**40%** of the technical blend with Stages 2–3; see §3.1 and `buildTechnicalScorecard()`).
- **Format (live product):** **Adversarial v2** — three **sprints** (Project Defense → Foundations → System Design), up to **15** total exchanges, with dynamic follow-ups (weakness / discrepancy / reasoning probes) driven by Gemini.
- **Trust:** Camera and tab/proctoring signals are required during the session; outcomes can be flagged for admin review when integrity or anti-gaming rules fire.

#### 3.4.2 Interview engines in the codebase

| Track | Entry | Behavior |
|-------|--------|----------|
| **Primary (verification UI)** | `POST /api/interview/v2/start`, `POST /api/interview/v2/turn`, `POST /api/interview/v2/partial` | Orchestrator in `server/src/services/interview/orchestrator.ts`: sprint personas, static openers per sprint, `processTurn` / agents for follow-ups and final evaluation. **Non-technical:** alternate sprint names/openers + **`generateSprintQuestion(nonTechnical, subtrack)`** + weighted dimension scoring. **Data (`roleType === "data"`):** data sprint names/openers + **`dataTrack` / `dataSubtrack`** in agents. Front end: `src/pages/verification/stages/ExpertInterviewStage.tsx`. |
| **AI Skills (software / data)** | `POST /api/interview/ai-skills/start`, `POST /api/interview/ai-skills/turn`, `GET /api/interview/ai-skills/status` | `aiSkillsOrchestrator.ts`; data track uses Data Round context and data-skills Part B. Verification stages: `ai_skills_interview` vs `data_skills_interview`. |
| **Data System Design** | `POST /api/interview/data-system-design/start`, `POST .../turn`, `GET .../status` | `systemDesignOrchestrator.ts`; `interviewType: system_design`; verification stage `data_system_design` only (data track). |
| **Legacy / question-plan** | `POST /api/interview/start`, `POST /api/interview/respond`, etc. | Older linear plan with optional **`QUESTION_BANK_SOURCE=db`** (`InterviewQuestionBank`). Still present for compatibility; the verification flow uses **v2** for the AI Expert Interview stage. |

#### 3.4.3 Voice, TTS, and environment

| Capability | Implemented | Notes |
|------------|-------------|--------|
| **Speech-to-text (live)** | Yes | **Deepgram** WebSocket when `DEEPGRAM_API_KEY` is set; otherwise **Web Speech API** (Chrome/Edge) with live partials and `/v2/partial` prefetch. Hook: `src/hooks/useDeepgramSession.ts`. |
| **TTS (question + fillers)** | Yes | **ElevenLabs** streaming MP3 when `ELEVENLABS_API_KEY` (and voice id) set; otherwise **`speechSynthesis`** fallback. Routes: `GET/POST` patterns under `server/src/routes/interview.ts` (`/tts`, `/tts-filler`). |
| **Whisper / post-hoc STT on audio** | No | Not in the v2 voice path; gap vs older gap-analysis doc for “upload then transcribe” pipelines. |
| **5s review / edit transcript before send** | No | Spec’d in `PRD.md` (Part D — AI Expert Interview) §5 for typed+voice hybrid; v2 is continuous voice turn submission without that gate. |
| **Typed answer toggle** | Partial | **`ExpertInterviewStage`** supports **voice vs typed** per `verificationRoleType`: **non-technical** defaults to **typed** with visible toggle; **technical** defaults **voice**. (Wire `verificationRoleType` from `VerificationFlow` when product wants data/software to differ.) |

**Production checklist (operator):** set `GEMINI_API_KEY`, optional `DEEPGRAM_API_KEY`, optional `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` on the API service so candidates get cloud STT/TTS instead of browser-only fallbacks.

#### 3.4.4 Proctoring, anti-gaming, and integrity

| Area | Status | Implementation pointers |
|------|--------|-------------------------|
| Tab switch, fullscreen, copy/paste, devtools (feature flags) | Live | `useProctoringRiskMonitor` in `ExpertInterviewStage`; events logged per session. |
| Face / phone hints | Live | `useFaceAndPhoneDetection` with optional server `STOP_TEST` when strict. |
| Session labels (baseline / elevated / high attention) | Live | Driven by logged violation counts, not a single “risk score” as the learner-facing number. |
| Anti-gaming scoring | Partial / live | `analyzeAnswerAntiGaming` and merge into `integrityFlag` / interview outcome (see `interview.ts` + services). |
| Admin override + `ProctoringReviewLog` | Per extended PRD | Model/checklist in `PRD.md` (Part D — AI Expert Interview); confirm admin UI coverage separately. |
| **`pending_review`** when Gemini eval fails | Partial | Canonical fallback and admin re-eval are spec’d in `PRD.md` (Part D — AI Expert Interview) §3; wire-up should be verified per release. |

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
| POST | `/api/interview/ai-skills/start` | AI Skills session (optional `isDataTrack`; stage must be in progress). |
| POST | `/api/interview/ai-skills/turn` | AI Skills answer turn. |
| GET | `/api/interview/ai-skills/status` | Resume AI Skills session. |
| POST | `/api/interview/data-system-design/start` | Data track only; prerequisite `data_skills_interview` completed. |
| POST | `/api/interview/data-system-design/turn` | Data System Design answer turn. |
| GET | `/api/interview/data-system-design/status` | Session status. |

#### 3.4.7 Implementation status matrix (summary)

| Item | Status |
|------|--------|
| 3-sprint adversarial v2 flow | Done |
| Data-track + non-technical calibration (sprints, `generateSprintQuestion`, `evaluateFullInterview` meta) | Done |
| Data System Design session (data track) | Done — see §3.0.1 |
| Software System Design stage (`system_design_interview`) | Partial — UI may remain placeholder until software session ships |
| Role + experience level on start | Done |
| Cloud STT/TTS + browser fallbacks | Partial — ElevenLabs + Deepgram live; **Cartesia** (spec §12) not yet; Deepgram model **nova-2** in client until **nova-3** (see `PRD.md` (Part D — AI Expert Interview) §16) |
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

Detailed task checklist and data model notes remain in **`PRD.md` (Part D — AI Expert Interview)** (especially Part B §16).

---

## 4. Expert Interviewer Module

### 4.1 Careers Page (`/careers/interviewer`)

**Purpose:** Recruitment of interviewers who will conduct Stage 5 human expert interviews.

**Compensation & economics (founding vs standard, recruiter add-on pricing):** **`PRD.md` (Part C — Business)** §4. Marketing copy should match locked rates (e.g. founding **₹750** / session).

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

- Interviewers matched by **`Interviewer.track`** (`technical` | `non_technical`). **`GET /api/verification/matched-interviewers`** maps **`JobSeekerProfile.roleType: data`** to **`technical`** for slot queries (same pool as software engineers unless product adds a dedicated data-expert track).
- Job seeker **`roleType`** (`technical` | `data` | `non_technical`) determines **verification** pipeline (§3.0 / §3.0.1).
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
VerificationStage ([userId, stageName], status, score)
  stageName (examples): profile_setup | aptitude_test | cs_fundamentals | domain_fundamentals |
    dsa_round | data_fundamentals | data_round |
    ai_skills_interview | data_skills_interview | system_design_interview | data_system_design |
    non_tech_assignment | expert_interview | human_expert_interview
  status: locked | in_progress | completed | failed | pending_review (where used)
  score: 0–100 on stage rows; raw aptitude marks on AptitudeTestResult; see PRD.md §11

JobSeekerProfile (verificationStatus, roleType, subtracks)
  verificationStatus: pending | verified | expert_verified
  roleType: technical | non_technical | data  (legacy **technical** = software path; **data** = data track)
  nonTechSubtrack, dataSubtrack: optional strings set when profile_setup completes (title-derived; see `verificationPipeline.ts`)
```

### 6.4 Proctoring & integrity signals

- **Violation counts (source of truth):** Each integrity signal type (tab switch, fullscreen exit, face issues, etc.) is tracked by **how many times** it was logged for the session (after server-side / client rate limits), not by a cumulative weighted “risk score.”
- **Persistence:** `ProctoringEvent.riskScore` stores the **1-based violation index for that signal type** in that session at log time. Full snapshots can live in `details` / `violationDetails`.
- **Interview row:** `Interview.riskScore` stores the **number of proctoring alert rows** for that AI interview session (for sorting/visibility). `integrityFlag` still captures review tiers; see `docs/PRD.md` (Part D) §6.
- **Learner UI:** Shows session labels driven by total logged violations and repeat counts (e.g. Baseline / Elevated / High attention), not a numeric risk score.

---

## 7. User Flows

### 7.1 Job Seeker (Technical Track)

**Legacy path:**

```
Sign Up → Profile Setup → Aptitude Test → DSA Round → AI Expert Interview (stage expert_interview)
  → Scorecard / shortlist check → Human Expert Interview (book slot) → expert_verified
  → Browse jobs, apply
```

**Pipeline v2 (typical):** same idea, but cognitive step may be `cs_fundamentals`; mid/senior add **AI Skills** and **System Design** interviews before **AI Expert**; exact order from `verificationStagesNeededTechnical()` / `GET /api/verification/stages`.

### 7.1.1 Job seeker (Data track)

**Pipeline v2:** See **§3.0.1**. In short: **Data Round** replaces DSA; **AI Skills (Data)** and **Data System Design** (mid/senior) precede the same **AI Expert** adversarial v2 session with **data-calibrated** sprints. Dashboard and `GET /api/verification/stages` use **`stage_order`** for **`roleType: data`**.

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

## 11. Verification scoring (aptitude, DSA & AI interview)

### 1. Aptitude Test

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

### 2. DSA Round

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

### 3. AI Expert Interview

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

### 4. How scores are used together (technical scorecard & shortlisting)

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

### 5. Historical note: API contract evolution

**Previous gap:** Some surfaces treated `VerificationStage.score` for aptitude as comparable to DSA (0–100) while it stored **raw marks**.

**Current approach (implemented):**

- Keep **raw earned marks** in **`AptitudeTestResult.score`** + **`answers.earnedMarks` / `answers.totalMarks`**.
- Write **rounded percentage 0–100** into **`VerificationStage`** and **`CandidateSkillVerification`** on submit.
- Normalize display in **users/jobs** via **`aptitudeScore.ts`**.

**Alternative not used:** Expose separate fields `aptitude_score_raw` and `aptitude_total_marks` everywhere — unnecessary given the above.

---

### 6. Summary table (as implemented)

| Stage | Grading unit | `VerificationStage.score` | Result table | Candidate-facing UI / list APIs |
|-------|----------------|---------------------------|--------------|----------------------------------|
| **Aptitude** | Weighted marks → **60% to pass** | **0–100 %** (rounded) | `AptitudeTestResult`: **raw marks** + **`answers`** | **%** (toasts, results screen); APIs **0–100** via stage + helpers |
| **DSA** | 0–100 | 0–100 | `DsaRoundResult`: 0–100 | 0–100 |
| **AI Interview** | 0–100 | 0–100 | `Interview`: 0–100 | 0–100 |

---

### 7. Non-technical track (for completeness)

- **Non-tech assignment:** Scored by AI; threshold 60/100; stored in `VerificationStage` (non_tech_assignment) as `score` (0–100). Qualified/failed from evaluation result.
- **Human expert interview:** Expert submits evaluation; weighted total ≥ 70 is pass. Stored in `VerificationStage` (human_expert_interview) as `score` (0–100).

---

*Use this PRD together with `docs/PRD.md` and `docs/PRD.md §2`. Implementation references: `server/src/routes/verification.ts` (aptitude), `server/src/data/aptitude-loader.ts`, `server/src/data/aptitude-session-db.ts`, `server/src/utils/aptitudeScore.ts`, `src/pages/verification/stages/AptitudeTestStage.tsx`.*

---

## 12. DSA questions storage & APIs

### 1. Purpose
This PRD defines how ProvenHire stores DSA questions and test cases in the database, how the seed process populates them, and how authenticated backend APIs expose questions / run tests without exposing hidden test inputs or expected outputs.

---

### 2. Scope

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
- **Aptitude test** (static question bank, `AptitudeSession`, grading, and **0–100** stage semantics) — see **`§11` (below)**

---

### 3. Data Storage Model (Prisma)

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

### 4. Seeding & Population

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

### 5. Backend API Contracts (Authenticated)

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

### 6. Security & Integrity Guarantees
- Hidden test cases (`DsaTestCase.isHidden=true`) must not expose:
  - `input`
  - `expected`
- Evaluation happens server-side only.
- Only authenticated users can access question selection and run tests.
- Question selection is restricted to an active `dsa_round` for the official `GET /dsa/questions` endpoint.

---

### 7. Operational Notes
- Keep difficulty strings consistent with backend filtering (`"Easy"`, `"Medium"`, `"Hard"`).
- If the seed source frontend data is changed:
  - validate that `templates` keys match supported languages expected by the frontend
  - validate that `testCases` have the expected `input` and `output` fields
- Seed reruns are idempotent because:
  - questions are upserted
  - test cases for the relevant questions are fully re-created

---

### 8. Acceptance Criteria
1. `GET /api/verification/dsa/questions` returns only question metadata (no testcases) and requires an active `dsa_round`.
2. `POST /api/verification/dsa/run-tests` uses Judge0 **batch** execution, structured per-case `status`, typed comparison via `expectedType`, persists a `DsaSubmission` row (`isOfficial: false`), and rate-limits repeated runs.
3. `POST /api/verification/dsa/submit` records one **official** submission per question (`isOfficial: true`), returns `409` on duplicate official submit, and runs the same evaluation pipeline as `run-tests`.
4. Hidden test cases never return `input` or `expected` in API responses (only `{ passed, status }`).
5. Seed script requires **explicit** `examples` (never derived from test case I/O); supports per-case `expectedType` and `timeoutMs`.

---

### 9. Schema additions (`DsaTestCase` & `DsaSubmission`)

- **`DsaTestCase.expectedType`**: `"exact" | "numeric" | "array" | "set"` — selects comparator in `server/src/services/dsaComparator.ts`.
- **`DsaTestCase.timeoutMs`**: optional per-case CPU budget (ms); `null` uses `DSA_DEFAULT_TIMEOUT_MS`.
- **`DsaSubmission`**: audit log for every `run-tests` and official `submit` — stores `code`, `language`, `passedCount`, `totalCount`, `isOfficial`, redacted `results` JSON, `submittedAt`.

**Migration:** `server/prisma/migrations/20260320120000_dsa_upgrade/migration.sql`

**Env:** `DSA_DEFAULT_TIMEOUT_MS`, `DSA_QUESTIONS_COUNT`, `JUDGE0_CE_URL`

---

## 13. Expert interviewer role (human Stage 5)

Expert interviewers conduct **human** expert interviews (verification stage `human_expert_interview` in legacy chain; eligibility and certification may vary when **`VERIFICATION_PIPELINE_V2`** is on — see `PRD.md` §3.0 (Part A)). They set availability, view candidate context, submit weighted evaluations (≥70 = pass / L3), and accrue per-session earnings. **Recruiter-paid human sessions** (₹2,500) are a separate product lane from candidate verification cost — see **`PRD.md` (Part C — Business)**. This file tracks **what the codebase implements** for the interviewer role.

### Implemented in this repo

| Area | Details |
|------|---------|
| **Schema** | `Interviewer` extensions (`bio`, `languagesSpoken`, `profileCompleted`, `totalInterviews`, `totalPassed`, `recurringSchedule`, `recurringActive`), `InterviewerBankDetails`, `InterviewerEarning`, `HumanInterviewSession.interviewerNotes` / `candidateFeedback`, `JobSeekerProfile.humanExpertRetryAfter`, `InterviewerApplication.currentCompany` / `jobTitle`. Migration: `server/prisma/migrations/20260406120000_expert_interviewer_prd`. |
| **Profile gate** | `GET`/`POST`/`PATCH /api/expert/profile` exempt; other expert routes require `profileCompleted`. Existing DB interviewers backfilled `profileCompleted = true` in migration; **new** invites start with `false` until `POST /api/expert/profile`. |
| **Invite token** | Admin approve: password-set token **72h** (was 7d). |
| **Evaluation** | Seven dimensions + PRD weights (technical vs non-technical), threshold 70, `409` on duplicate submit. Response omits pass/fail; shows `earningsPaise`, `weightedScoreSubmitted`. |
| **Earnings** | `InterviewerEarning` per submission (₹25000 paise). `GET /api/expert/earnings/summary`, `/history`, `/sessions`. |
| **Bank** | `POST /api/expert/bank-details` with AES-256-GCM (`BANK_DETAILS_ENCRYPTION_KEY` in production). |
| **Slots** | `GET/POST /api/expert/slots`, `POST /api/expert/slots/bulk`, recurring `POST/DELETE /api/expert/recurring-schedule`. |
| **Cron** | `POST /api/cron/expert-recurring-slots` (with `CRON_SECRET`) → `generateRecurringSlotsForAllInterviewers`. |
| **Cooldown** | Failed expert eval sets `humanExpertRetryAfter` (+30d). `getHumanInterviewEligibility` + `/api/verification/book-slot` respect cooldown. |
| **Careers form** | `/careers/interviewer` — company, title, 5+ years, 100+ char why, required phone/LinkedIn. |
| **UI** | `/dashboard/expert/profile-setup`, dashboard redirect if incomplete, interview room 7 dimensions + feedback fields, admin table columns for company/title. |

### Operational notes

- Schedule cron: `expire-skills` (existing) + **`expert-recurring-slots`** daily if using recurring availability.
- **`BANK_DETAILS_ENCRYPTION_KEY`**: 32-byte value as hex (64 chars) or base64; required in production for bank POST.

### Out of scope (per PRD)

In-app video (Meet link only), Razorpay **payout** to interviewers, full dossier page, earnings payout calendar automation, candidate-facing interviewer stats card polish.

---

*For the full PRD (screens, copy, acceptance criteria), use the canonical product document. This file is the engineering index.*

---

## 14. Non-Functional Requirements

- **Security:** JWT auth, role-based access, protected routes; auth rate limits; hardened CORS and headers on API (see deployment docs)
- **Responsive:** Mobile-friendly UI
- **Performance:** Lazy loading for heavy routes
- **Accessibility:** Semantic HTML, ARIA where needed

---

## 15. Future Considerations

- Email delivery for interviewer invite (currently link copy-paste)
- In-app video call integration (currently external Zoom/Meet link)
- Automated payouts and in-app payment (Razorpay) — see **PRD.md (Part C — Business)** § Parked
- Non-technical track Stage 5 (human expert) if needed

---

*PRD v6.7 — April 2026 — consolidated doc set*

---

<!-- PART B: RECRUITER — merged from former PRD_RECRUITER.md -->

# PRD: Recruiter — Complete Product Requirements

**Version:** 1.1  
**Date:** April 2026  
**Status:** Final (revenue rules aligned with implementation)  
**Author:** ProvenHire Product Team  

**Team index:** [docs/README.md](README.md) · **Main PRD:** [Part A — Candidate](#1-executive-summary) · **Revenue & limits:** [Part C — Business](#prd--business-rules--engineering-backlog) Part 1 · **Test recruiter seed:** `server/prisma/seed-recruiter.ts`

---

## 1. Purpose

This PRD defines the complete recruiter experience on ProvenHire — from sign-up and admin approval through candidate discovery, job posting, application pipeline management, and analytics. Every screen, every flow, every rule, and every API contract is specified so any developer can implement or extend the recruiter product without ambiguity.

---

## 2. Scope

**In scope:**

- Recruiter sign-up and admin verification flow
- Recruiter onboarding and company profile
- Candidate search and discovery
- Candidate card and full resume view
- AI interview score breakdown (deep view)
- Job posting and management
- Kanban application pipeline
- Company profile public page
- Recruiter analytics dashboard (Growth tier — when wired to `subscriptionTier`)
- Revenue model: **subscription tiers**, profile-view caps, **Express Interest** contact credits, JD interview allowances (see §9)

**Out of scope:**

- In-app messaging (deferred)
- Job certification level gating (excluded by product decision)
- **Razorpay / automated billing** — manual UPI + admin plan update until volume threshold (see **PRD.md (Part C — Business)**)

---

## 3. Recruiter Sign-Up and Admin Verification

### 3.1 Sign-Up Flow

Route: `/auth?mode=signup` with role selection = Recruiter

**Fields collected at sign-up:**

| Field | Required | Notes |
|-------|----------|-------|
| Full name | Yes | Recruiter's personal name |
| Work email | Yes | Must be company domain — not Gmail, Yahoo, Hotmail, Outlook personal |
| Password | Yes | Min 8 characters |
| Company name | Yes | |
| Company size | Yes | 1–10, 11–50, 51–200, 201–500, 500+ |
| Designation | Yes | e.g. HR Manager, Talent Acquisition Lead |
| Phone | Yes | |

On submit:

- Account created via `POST /api/auth/register` with `role: "recruiter"`
- `RecruiterProfile` row created with `verificationStatus: "pending"`
- Admin notified of new recruiter application
- Recruiter redirected to pending approval screen

### 3.2 Post Sign-Up — Company Details Collection

After sign-up, before admin review, recruiter is prompted to complete company profile:

**Fields:**

| Field | Required | Notes |
|-------|----------|-------|
| Company logo | Yes | Image upload — **Cloudflare R2** (S3-compatible) when `CLOUDFLARE_R2_*` env is set; else local/uploads per `server/src/services/storage.service.ts` |
| Company website | Yes | Must be valid URL |
| Industry | Yes | Dropdown — Technology, Finance, Healthcare, E-commerce, EdTech, SaaS, Other |
| Company LinkedIn URL | Yes | Verified company page |
| Company description | Yes | Min 100 characters — shown on public company profile |
| Headquarters location | Yes | City, Country |
| Hiring for roles | Yes | Multi-select from role list |
| Preferred experience levels | Yes | Fresher / Mid / Senior — multi-select |

All data saved via `POST /api/users/recruiter-profile`

On completion:

- `RecruiterProfile.onboardingCompleted = true`
- All data sent to admin review queue
- Recruiter sees: **"Your account is under review. Our team will verify your company details within 24–48 hours. You will receive an email once approved."**

### 3.3 What Recruiter Sees Before Approval

While `verificationStatus = "pending"`, recruiter can see:

- Landing page
- Public job listings (read-only)
- About page
- Their own profile (read-only)
- Pending approval message on dashboard

Recruiter **cannot** access:

- Candidate search
- Post jobs
- Application pipeline
- Any candidate data

### 3.4 Admin Approval Flow

Admin Dashboard → Recruiters tab → Pending Applications

Admin sees for each recruiter:

- Company name + logo
- Work email + domain
- Company website + LinkedIn
- Company description
- Designation and phone
- Date submitted

Admin actions:

- **Approve** → `verificationStatus = "verified"`, recruiter gets email + access unlocked
- **Reject** → `verificationStatus = "rejected"`, recruiter gets email with reason
- **Request more info** → Admin adds note, recruiter gets email asking for additional details

API (align with `server/src/routes/admin.ts`):

```
PATCH /api/admin/recruiters/:id/verification
  Body: { "status": "verified" | "rejected", "reason"?: string }
```

### 3.5 After Approval

Recruiter receives email: *"Your ProvenHire recruiter account has been approved. You now have access to our verified candidate pool."*

Recruiter redirected to `/dashboard/recruiter` — full access unlocked.

---

## 4. Recruiter Dashboard

Route: `/dashboard/recruiter`

### 4.1 Layout

**Left sidebar navigation:**

- Dashboard (home)
- Candidate Search
- My Jobs
- Applications (Kanban)
- Analytics
- Settings

**Top bar:**

- Company logo + name
- Notification bell
- Profile dropdown (Settings, Sign out)

### 4.2 Dashboard Home Sections

**Section 1 — Stats bar (top)**

| Stat | Description |
|------|-------------|
| Active Jobs | Number of currently published job posts |
| Total Applications | Applications received across all jobs |
| Shortlisted Candidates | Candidates moved to Shortlisted stage |
| Avg. Time to Shortlist | Average days from application to shortlist decision |

**Section 2 — Recently Verified Candidates**

Shows 6 most recently L2/L3 verified candidates matching the recruiter's hiring preferences (role + experience level set during onboarding). Each shown as a candidate card (see §5.2).

CTA: "View all verified candidates →" links to Candidate Search.

**Section 3 — Active Jobs**

List of recruiter's published jobs with:

- Job title
- Applications count
- New applications (unread badge)
- Posted date
- Quick actions: View Applications, Edit, Pause

**Section 4 — Recent Applications**

Latest 5 applications across all jobs with:

- Candidate name + certification badge
- Job they applied to
- Application date
- Current pipeline stage
- Quick action: Move to next stage

---

## 5. Candidate Search and Discovery

Route: `/candidate-search`

### 5.1 Search Filters

Left panel — collapsible filter sidebar:

| Filter | Type | Options |
|--------|------|---------|
| Certification Level | Multi-select | L1 Cognitive Verified, L2 Skill Passport, L3 Elite Verified |
| Experience Tier | Multi-select | Fresher (0–1yr), Mid (1–3yr), Senior (3+yr) |
| Target Role | Multi-select | All roles from job seeker role list |
| Skills | Tag search | Free text — matches against candidate skills array |
| Location | Multi-select | City or Remote |
| Notice Period | Dropdown | Immediate, < 15 days, < 1 month, < 2 months, Any |
| DSA Score | Range slider | 0–100 |
| AI Interview Score | Range slider | 0–100 |
| Track | Toggle | Technical / Non-Technical |

**Sort options:**

- Ranking Score (default — highest first)
- Most Recently Verified
- AI Interview Score
- DSA Score
- Experience (highest)

### 5.2 Candidate Card

Each candidate in search results shows a card with:

```
┌─────────────────────────────────────────────────────┐
│  [Avatar initials]  Name (anonymized until interest) │
│                     Target Role                       │
│                                                       │
│  🏅 L2 Skill Passport                                │
│                                                       │
│  Cognitive: 84%  DSA: 76%  AI Interview: 71%        │
│                                                       │
│  Experience: 2 years  │  Notice: 30 days             │
│  Location: Bangalore  │  Track: Technical             │
│                                                       │
│  Skills: Python  React  Node.js  PostgreSQL  +3      │
│                                                       │
│  [View Full Profile]          [Express Interest]      │
└─────────────────────────────────────────────────────┘
```

**Anonymization rule:**

- Candidate full name shown as first name + last initial (e.g. "Ravi K.") until recruiter expresses interest
- Email and phone never shown on card — only after candidate accepts interest
- Full name revealed on full profile view after interest expressed

**Certification badge colors:**

- L1 Cognitive Verified — Gold/Yellow
- L2 Skill Passport — Blue
- L3 Elite Verified — Green

### 5.3 Full Candidate Profile (Resume View)

Route: `/candidate/:profileId`

Opened when recruiter clicks "View Full Profile" on a candidate card.

**This is the ProvenHire-generated resume** — not just the uploaded resume. It is built from:

- Profile data (filled during profile setup)
- Verification scores from all completed stages
- Skills verified through assessment performance
- AI interview insights (strengths, areas to improve)
- Certification badges earned

**Important:** This resume is updated and enriched by ProvenHire based on every verification step the candidate completes. It is more trustworthy than a self-submitted resume because every claim is backed by assessment data.

**Full profile sections:**

**Header:**

- Full name (revealed after interest)
- Target role + experience level
- Location + notice period + current/expected CTC
- Certification level badge (large, prominent)
- Contact details (shown only after candidate accepts interest)

**ProvenHire Verification Summary:**

```
┌─────────────────────────────────────────────────────┐
│  VERIFICATION SCORES                                 │
│                                                      │
│  Cognitive Assessment    84%  ████████░░  Completed  │
│  DSA Round               76%  ███████░░░  Completed  │
│  AI Expert Interview     71%  ███████░░░  Completed  │
│  Human Expert Interview  Pass ██████████  Verified   │
│                                                      │
│  Overall Ranking Score: 78/100                       │
│  Integrity Flag: Clean                               │
└─────────────────────────────────────────────────────┘
```

**AI Interview Deep Breakdown:**

Shown only on full profile view — never on candidate card:

```
┌─────────────────────────────────────────────────────┐
│  AI EXPERT INTERVIEW ANALYSIS                        │
│                                                      │
│  Sprint 1: Project Defense     ████████░░  78%      │
│  Sprint 2: Foundations         ███████░░░  71%      │
│  Sprint 3: System Design       ██████░░░░  65%      │
│                                                      │
│  Reasoning:         80/100                           │
│  Technical Depth:   72/100                           │
│  Communication:     85/100                           │
│  Adaptability:      68/100                           │
│                                                      │
│  Hire Recommendation: MAYBE                          │
│  Confidence: High                                    │
│                                                      │
│  What they did well:                                 │
│  • Strong system design thinking at baseline scale   │
│  • Clear communication of trade-offs                 │
│                                                      │
│  Areas to probe further:                             │
│  • Distributed systems depth beyond single-node      │
│  • Database indexing under high write throughput     │
│                                                      │
│  Failure Surface:                                    │
│  Distributed Caching: ████░░░░░░  Strong            │
│  Database Scaling:    ██████░░░░  Moderate          │
│  System Design:       ████████░░  Needs probing     │
└─────────────────────────────────────────────────────┘
```

**Skills section:**

- Skills list from profile
- Verified skills highlighted (those that appeared in DSA/interview performance)

**Work Experience:**

- From resume — each role with company, years, responsibilities
- ProvenHire note: *"Experience claims cross-referenced against AI interview performance"*

**Education:**

- From resume

**Projects:**

- From profile setup

**Quick actions on full profile:**

- Express Interest (if not already done)
- Add to Shortlist (saves to recruiter's shortlist)
- Download Resume PDF

### 5.4 Express Interest Flow

When recruiter clicks "Express Interest":

1. Candidate receives in-app notification: *"[Company Name] is interested in your profile for [Job Title or General Role]"*
2. Candidate can Accept or Decline
3. If accepted: recruiter gets notification, candidate full name + contact details revealed
4. If declined: recruiter notified, candidate remains anonymous

API:

```
POST /api/notifications/contact-candidate
  { candidateId, jobId (optional), message (optional) }

GET /api/recruiter/interests
  Returns list of expressed interests with status (pending/accepted/declined)
```

---

## 6. Job Posting

Route: `/post-job`

### 6.1 Job Post Form

**Basic Details:**

| Field | Required | Notes |
|-------|----------|-------|
| Job title | Yes | e.g. Senior Backend Engineer |
| Job track | Yes | Technical / Non-Technical |
| Role category | Yes | From role list — Backend, Frontend, Marketing, etc. |
| Location | Yes | City or Remote or Hybrid |
| Work mode | Yes | Remote / Hybrid / On-site |
| Job type | Yes | Full-time / Part-time / Contract / Internship |
| Experience required | Yes | Fresher / Mid / Senior |
| Salary range | Yes | e.g. 12–18 LPA |
| Application deadline | Yes | Date picker |

**Job Description:**

| Field | Required | Notes |
|-------|----------|-------|
| About the role | Yes | Min 200 characters |
| Key responsibilities | Yes | Bullet point editor — min 3 points |
| Required skills | Yes | Tag input — min 3 skills |
| Nice to have skills | No | Tag input |
| About the company | Auto-filled | From recruiter's company profile — editable |

**Company section (auto-filled from profile — editable per job):**

- Company logo
- Company name
- Industry
- Company size
- Company description
- Company website
- Company LinkedIn

**Why this matters:** Candidates see a complete, professional company profile on every job post. Transparency increases application quality and candidate trust.

### 6.2 Job Status

| Status | Meaning |
|--------|---------|
| Draft | Saved but not published |
| Published | Active — visible to eligible candidates |
| Paused | Temporarily hidden — not accepting applications |
| Closed | No longer accepting — applications preserved |

### 6.3 My Jobs Page

Route: `/dashboard/recruiter` → My Jobs tab

Table view with columns:

- Job title
- Status badge
- Applications count
- New applications (unread)
- Posted date
- Deadline
- Actions: View Applications, Edit, Pause/Resume, Close

---

## 7. Kanban Application Pipeline

Route: `/dashboard/recruiter/applications`

### 7.1 Pipeline Columns

Five columns — candidates move left to right:

```
Applied → Reviewing → Shortlisted → Interview Scheduled → Offer / Rejected
```

| Column | Description |
|--------|-------------|
| Applied | All new applications — unreviewed |
| Reviewing | Recruiter is evaluating the profile |
| Shortlisted | Recruiter has decided to proceed |
| Interview Scheduled | Human interview or call arranged |
| Offer / Rejected | Final decision made |

### 7.2 Candidate Card in Kanban

Each card in the pipeline shows:

```
┌───────────────────────────────┐
│  Ravi K.           🏅 L2     │
│  Backend Developer            │
│  AI Score: 71  DSA: 76       │
│  Applied: 2 days ago          │
│  Job: Senior Backend Eng.     │
│                               │
│  [View Profile]  [⋮ Actions] │
└───────────────────────────────┘
```

**Card actions (⋮ menu):**

- Move to next stage
- Move to any stage (jump)
- Add note
- Express interest
- Reject (moves to Rejected column with optional reason)

### 7.3 Drag and Drop

- Recruiter drags card from one column to another
- On drop: stage updates in DB via `PATCH /api/jobs/applications/:id/status`
- Stage change logged with timestamp
- If moved to Shortlisted: optional analytics only; **monetization** is via profile views + Express Interest (see §9)

### 7.4 Filter by Job

Top of Kanban has a job selector dropdown — recruiter can view pipeline for:

- All jobs (combined view)
- Specific job (filtered view)

### 7.5 Column Customization

Recruiter can add notes per candidate card. Notes are recruiter-private — candidates never see them.

API:

```
PATCH /api/jobs/applications/:id/status
  { status: "reviewing" | "shortlisted" | "interview_scheduled" | "offer" | "rejected" }

POST /api/jobs/applications/:id/note
  { note: string }

GET /api/jobs/recruiter/applications
  Returns all applications with stage, candidate summary, job title
  Filter params: ?jobId=&stage=&page=&limit=
```

---

## 8. Company Profile (Public Page)

Route: `/company/:companyId`

Visible to all job seekers. Linked from every job post.

**Sections:**

**Header:**

- Company logo (large)
- Company name
- Industry + company size
- Headquarters location
- Website link + LinkedIn link
- "X active jobs" count

**About:**

- Company description (full text)
- What they build / their mission

**Culture and Benefits:**

- Optional section — recruiter can add bullet points about work culture, benefits, perks
- e.g. "Remote-first", "Health insurance", "Learning budget"

**Active Jobs:**

- Grid of currently published jobs from this company
- Each card shows: title, location, experience level, salary range, Apply button

**Verification Badge:**

- "ProvenHire Verified Recruiter" badge shown if `verificationStatus = "verified"`
- Builds candidate trust

API:

```
GET /api/companies/:companyId
  Returns public company profile + active jobs
```

---

## 9. Revenue Model — Subscription Tiers (PRD 4)

**Canonical tables and business rules:** **`docs/PRD.md` (Part C)**. Below: recruiter-product summary + **implemented** API hooks.

### 9.1 Tier limits (product)

| Tier | Price (INR/mo) | Active jobs | Full profile views / month | Express Interest (contacts) / month | JD AI interviews / month | Analytics |
|------|------------------|------------|----------------------------|--------------------------------------|----------------------------|-----------|
| **Free** | 0 | 2 | 5 | **0** | 0 | No |
| **Starter** | 2,999 | 5 | 50 | 10 | 5 | No |
| **Growth** | 7,999 | ∞ | ∞ | 30 | 10 | Yes |

- **Active jobs:** published jobs only (drafts/closed excluded from cap semantics in product).
- **Profile view:** dedupe per recruiter–candidate pair; opening **full ProvenHire Resume** consumes **one** view credit for that pair (grid browse does not).
- **Contacts:** each `POST /api/notifications/contact-candidate` consumes **one** credit; **402** when tier limit is 0 or exhausted.
- **Monthly reset:** usage counters roll forward on **UTC calendar month** start (`server/src/services/recruiterUsagePeriod.service.ts`).
- **Paywall UX:** in-context upgrade modal when a limit is hit; **sidebar CTA** when any meter ≥ ~80% (product direction).

### 9.2 Per-use charges (recruiter)

| Item | INR | When |
|------|-----|------|
| JD AI interview (beyond allowance) | 799 | When billing path exists |
| Human expert interview | 2,500 | Per session |

### 9.3 Progressive information reveal

Aligns with **PRD.md (Part C — Business)** §5: grid → full resume (no PII) → post-acceptance identity → phone last.

### 9.4 `RecruiterUsage` (schema)

See `server/prisma/schema.prisma` — includes `subscriptionTier` (`free` | `starter` | `growth`), legacy `planType`, `profileViewCountMonth`, **`contactCountMonth`**, **`jdInterviewCountMonth`**, `shortlistCountMonth`, `activeJobCount`, `periodStart`.

### 9.5 Usage & admin APIs (implemented)

```
GET  /api/users/me/recruiter-subscription
  Recruiter auth — returns tier, limits, MTD used counters, periodStart.

PATCH /api/admin/recruiters/:id/plan
  Body: { "subscriptionTier": "free" | "starter" | "growth" }
  :id = RecruiterProfile.id — after manual payment verification.
```

**Note:** Routes like `GET /api/recruiter/usage` or `POST /api/recruiter/shortlist/:candidateId` in older drafts are **not** the canonical pattern; prefer **`/api/users/me/recruiter-subscription`** + existing Kanban/application APIs. **Shortlist** quota as a *primary* monetization gate has been **superseded** by **profile views + contacts** per PRD 4 (shortlist counts may still exist for analytics).

---

## 10. Recruiter Analytics Dashboard

Route: `/dashboard/recruiter/analytics`

**Product intent:** **Growth** subscription only (`subscriptionTier === "growth"`). Free/Starter: blurred preview + upgrade prompt (see PRD 4).

### 10.1 Overview Stats

| Metric | Description |
|--------|-------------|
| Time to Shortlist | Avg days from application received to shortlist decision |
| Application Funnel | Applied → Reviewing → Shortlisted → Interview → Offer conversion rates |
| Candidate Quality Score | Avg AI interview score + DSA score of applicants |
| Top Performing Job | Job post with highest qualified application rate |

### 10.2 Charts

**Application Funnel (vertical funnel chart):**

Shows drop-off at each pipeline stage across all jobs.

**Candidate Quality Distribution (histogram):**

Distribution of overall ranking scores of all candidates who applied to recruiter's jobs. Shows whether they're attracting high-quality verified talent.

**Time to Hire Trend (line chart):**

Week-by-week average time from application to offer. Shows if hiring process is speeding up or slowing down.

**Job Post Performance (bar chart):**

Per job — applications received, shortlisted, offers made.

### 10.3 Key Insight ProvenHire Provides

Two core problems ProvenHire solves for recruiters — surfaced prominently in analytics:

**Problem 1 — High hiring time:**

Metric shown: *"Your avg time to shortlist is X days. ProvenHire verified candidates are shortlisted 3× faster than unverified candidates on the platform."*

**Problem 2 — Candidate quality uncertainty:**

Metric shown: *"X% of candidates who reached your Interview stage were L2 or L3 verified — meaning their skills were independently assessed before they applied."*

These two insights are the platform's core value proposition made visible to the recruiter.

---

## 11. Recruiter Settings

Route: `/dashboard/recruiter/settings`

### 11.1 Profile Information

- Full name
- Work email (read-only)
- Phone
- Designation
- Profile photo

### 11.2 Company Profile

All fields from onboarding — editable:

- Company logo (re-upload)
- Company name
- Company description
- Industry
- Company size
- Headquarters
- Website URL
- LinkedIn URL
- Hiring for roles
- Culture and benefits section

### 11.3 Hiring Preferences

- Preferred roles (multi-select)
- Preferred experience levels
- Preferred locations
- Minimum certification level preference (for candidate recommendations — not a hard gate)
- Email notification preferences

### 11.4 Account Security

- Change password
- Sign out

---

## 12. API Surface — Recruiter

### Auth

```
POST /api/auth/register          Role: recruiter
POST /api/auth/login
GET  /api/auth/me
```

### Recruiter Profile

```
GET  /api/users/recruiter-profile
POST /api/users/recruiter-profile
```

### Candidate Search

```
GET  /api/users/candidates
  Query params:
    certificationLevel: L1 | L2 | L3
    experienceTier: fresher | mid | senior
    targetRole: string
    skills: string (comma-separated)
    location: string
    noticePeriod: immediate | 15days | 1month | 2months
    dsaScoreMin: number
    dsaScoreMax: number
    aiScoreMin: number
    aiScoreMax: number
    track: technical | non_technical
    sortBy: rankingScore | recentlyVerified | aiScore | dsaScore | experience
    page: number
    limit: number

GET  /api/users/candidates/:profileId
  Returns full profile + verification scores + AI interview breakdown
```

### Interest / Contact

```
POST /api/notifications/contact-candidate
  { candidateUserId: string, recruiterMessage?: string }
  Recruiter role; enforces contact monthly limit (402 CONTACT_LIMIT when exhausted or free tier).

GET  /api/recruiter/interests
  Returns interest list with status
```

### Jobs

```
GET  /api/jobs/recruiter              My posted jobs
POST  /api/jobs                        Create job post
PATCH  /api/jobs/:id                   Edit job
PATCH  /api/jobs/:id/status            Publish | Pause | Close
DELETE /api/jobs/:id                  Delete draft

GET  /api/companies/:companyId        Public company profile
```

### Applications (Kanban)

```
GET  /api/jobs/recruiter/applications
  Query: ?jobId=&stage=&page=&limit=

PATCH /api/jobs/applications/:id/status
  { status: "reviewing" | "shortlisted" | "interview_scheduled" | "offer" | "rejected" }

POST  /api/jobs/applications/:id/note
  { note: string }
```

### Subscription usage

```
GET  /api/users/me/recruiter-subscription
  Tier, limits, profileViewCountMonth, contactCountMonth, jdInterviewCountMonth, periodStart.
```

### Analytics

```
GET  /api/recruiter/analytics/overview
GET  /api/recruiter/analytics/funnel
GET  /api/recruiter/analytics/quality
GET  /api/recruiter/analytics/jobs
```

### Admin (Recruiter Management)

```
GET   /api/admin/recruiters                        All recruiters with status
PATCH /api/admin/recruiters/:id/verification       { status: "verified"|"rejected", reason? }
PATCH /api/admin/recruiters/:id/plan               { subscriptionTier: "free"|"starter"|"growth" }
```

---

## 13. Data Models

### RecruiterProfile (additions to existing)

```prisma
model RecruiterProfile {
  // existing fields...

  // New fields
  companyDescription    String?   @db.Text
  headquarters          String?
  cultureAndBenefits    Json?     // string[]
  hiringForRoles        Json?     // string[]
  preferredExperienceLevels Json? // string[]
  verificationRejectedReason String?
  verifiedAt            DateTime?
  rejectedAt            DateTime?

  usage RecruiterUsage?
}
```

### RecruiterUsage

```prisma
model RecruiterUsage {
  id                    String   @id @default(uuid())
  recruiterId           String   @unique
  planType              String   @default("free")   // legacy: free | paid
  subscriptionTier      String   @default("free")   // free | starter | growth
  shortlistCountMonth   Int      @default(0)
  profileViewCountMonth Int      @default(0)
  contactCountMonth     Int      @default(0)
  jdInterviewCountMonth Int      @default(0)
  activeJobCount        Int      @default(0)
  periodStart           DateTime @default(now())
  periodEnd             DateTime?
  updatedAt             DateTime @updatedAt
  recruiter RecruiterProfile @relation(...)
}
```

### JobApplication (additions)

```prisma
model JobApplication {
  // existing fields...

  // New fields
  recruiterNote     String?   @db.Text
  stageChangedAt    DateTime?
  stageHistory      Json?     // [{ stage, changedAt, changedBy }]
}
```

---

## 14. UI/UX Standards

### Candidate Card Design Rules

- Certification badge always prominently displayed — color-coded (Gold/Blue/Green)
- Scores shown as percentage bars not raw numbers
- Skills shown as chips — max 5 visible, "+X more" overflow
- Card hover state: subtle elevation shadow
- "Express Interest" button: primary color — most important CTA
- "View Full Profile" button: secondary — leads to resume

### Kanban Board Design Rules

- Column headers show count badge: "Applied (12)"
- Cards draggable — cursor changes to grab on hover
- Drop zones highlighted in blue on drag
- Stage change: optimistic UI update + API call in background
- On API failure: revert card position + toast error
- Empty column state: illustrated empty state with helpful text
- **Legacy / optional:** Kanban column locks for free tier if product still uses them; **PRD 4** primarily gates **profile views** and **contacts**.

### Full Profile / Resume Design Rules

- ProvenHire-generated resume clearly labeled: *"Verified by ProvenHire"* badge at top
- Verification scores section: progress bars with percentage labels
- AI interview breakdown: expandable section — collapsed by default
- Failure surface: horizontal bar chart per domain
- Skills: two groups — "Verified skills" (bold, checkmark) vs "Self-reported skills"
- Download button: generates PDF version of ProvenHire resume

### Company Profile Design Rules

- Hero section with large logo + cover image (optional)
- All active jobs shown in a card grid
- ProvenHire Verified badge shown prominently
- Mobile responsive

---

## 15. Recruiter Verification Email Templates

### Approval email

```
Subject: Your ProvenHire recruiter account is approved

Hi [Name],

Your ProvenHire recruiter account for [Company Name] has been approved.

You now have access to our pool of verified candidates — each one assessed through our verification pipeline (cognitive, live coding, AI interviews, and optional human expert — see `PRD.md` §3).

Get started: provenhire.in/dashboard/recruiter

The ProvenHire Team
```

### Rejection email

```
Subject: ProvenHire recruiter account — additional verification needed

Hi [Name],

We were unable to verify your recruiter account for [Company Name] at this time.

Reason: [Admin reason]

If you believe this is an error or want to provide additional information, please reply to this email.

The ProvenHire Team
```

---

## 16. Acceptance Criteria

1. Recruiter signs up → sees pending state → cannot access candidate data until approved
2. Admin receives recruiter application in pending queue with all company details
3. Admin approves → recruiter gets email → dashboard unlocks immediately
4. Candidate search returns correct results for all filter combinations
5. Candidate card shows anonymized name until interest expressed
6. Full profile view shows ProvenHire-generated resume with verification scores
7. AI interview breakdown (sprint scores, failure surface, hire recommendation) visible on full profile — never on candidate card
8. Express interest sends notification to candidate — full details revealed only on acceptance
9. Job post form captures all required fields including required skills and experience level
10. Kanban board shows all 5 columns — drag and drop updates stage in DB
11. Stage change logged in `stageHistory` with timestamp
12. Free tier: **Express Interest** blocked (0 contacts) or profile view cap enforced — **402** + upgrade prompt
13. **Growth** tier: full analytics dashboard; Starter/Free see preview gating per PRD 4
14. Company profile public page shows logo, description, active jobs, verified badge
15. Recruiter analytics shows time-to-shortlist, candidate quality distribution, application funnel
16. All candidate data APIs require `requireAuth` + recruiter role check
17. Candidate phone and email never exposed until interest accepted by candidate

---

## 17. Security and Access Control

| Rule | Enforcement |
|------|-------------|
| Only verified recruiters access candidate search | `verificationStatus === "verified"` check on all candidate APIs |
| Candidate PII (phone, email) hidden until interest accepted | Filtered at API response level |
| Recruiter can only see applications for their own jobs | `postedById === recruiter.id` filter on all application queries |
| Analytics for Growth tier | `subscriptionTier === "growth"` (or equivalent) on analytics routes |
| Admin recruiter management routes | `requireAdmin` middleware |
| Candidate full profile view counted toward monthly limit | Middleware increments `profileViewCountMonth` |

---

## Appendix A — Implementation status (repo)

| Area | Status |
|------|--------|
| PRD document | `docs/PRD.md` (Part B — Recruiter) |
| Prisma | `RecruiterUsage` (+ `subscriptionTier`, `contactCountMonth`, `jdInterviewCountMonth`); migrations through `20260411160000_revenue_prd4_usage_retakes` |
| REST & UI in §12 | **Usage:** `GET /api/users/me/recruiter-subscription`; **contact:** `POST /api/notifications/contact-candidate`; align analytics gating with **Growth** tier |

*PRD v1.1 — April 2026 | ProvenHire Product Team*  
*Revenue numbers and tier rules: **PRD.md (Part C — Business)**.*


---

<!-- PART C: BUSINESS — merged from former PRD_BUSINESS.md -->

# PRD — Business rules & engineering backlog

**Consolidated April 2026.** Part 1 = revenue and limits (formerly *PRD_REVENUE_AND_BUSINESS_RULES*). Part 2 = implementation backlog (formerly *PRD_TECHNICAL_IMPLEMENTATION_REMAINING*).

**Index:** [README.md](README.md) · Main product: [Part A — Candidate](#1-executive-summary) · Recruiter: [Part B — Recruiter](#prd-recruiter--complete-product-requirements)

---

# Part 1 — Revenue model and business rules

**ProvenHire v2.0 · Decisions locked · April 2026**

**Implementation index:** `server/src/constants/revenue.ts` · `server/src/services/candidateRetake.service.ts` · `server/src/services/verificationStageRetakeGate.service.ts` · `server/src/utils/recruiterSubscription.ts` · `server/src/services/recruiterUsagePeriod.service.ts` · migrations through `20260411160000_revenue_prd4_usage_retakes`.

**Related:** [Part B — Recruiter](#prd-recruiter--complete-product-requirements) §9 · [README.md](README.md)

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

*Canonical backlog for remaining build-out. Product business rules: Part 1 above. Pipeline definitions: [Part A — Candidate](#1-executive-summary) §3.0.*



---

<!-- PART D: AI INTERVIEW — merged from former PRD_AI_INTERVIEW.md -->

# PRD — AI Expert Interview (full specification)

**Consolidated April 2026.** Part A = concise master spec (stack, placement, APIs). Part B = full product specification (formerly *PRD_AI_INTERVIEW_ROUND*).

**Index:** [README.md](README.md) · Main PRD summary: [Part A — Candidate](#1-executive-summary) §3.4 · Revenue & retakes: [Part C — Business](#prd--business-rules--engineering-backlog)

<a id="part-a--master-summary"></a>

## Part A — Master summary

## 1. Purpose

- **Candidate:** Structured technical dialogue (voice-first) that measures depth, reasoning, and communication—not static Q&A only.
- **Employer signal:** A **0–100** AI interview score and badge (Elite / Gold / Silver / Not Verified) feeding the **Skill Passport** and recruiter views.
- **Philosophy:** **Adversarial v2** probes failure boundaries via dynamic follow-ups (weakness, discrepancy, reasoning probes), not flash-card correctness.

---

## 2. Verification placement & gating

| Stage | Name | Notes |
|-------|------|--------|
| 1–3 | Profile, Aptitude/CS fundamentals, DSA | Prerequisites (exact `stageName` depends on `VERIFICATION_PIPELINE_V2`; see `PRD.md` §3.0 (Part A)) |
| **Late pipeline** | **AI Expert Interview** | Verification stage `expert_interview`; interview type **`ai_expert`**. *Legacy copy* calls this “Stage 4”; in **pipeline v2** it follows **AI Skills** (all tiers) and **System Design** (**`system_design_interview`** software mid/senior, **`data_system_design`** data mid/senior). **Data profiles** use the same v2 engine with **data-calibrated** sprints and evaluation meta. |
| Human step | Human expert interview | Separate PRD; `human_expert_interview` where enabled |

**Retakes / cooldowns** for `expert_interview` sessions: **`docs/PRD.md` (Part C)** + `gateExpertInterviewStart` in `interview.ts`.

**Technical scorecard blend:** `aptitude × 0.25 + DSA × 0.35 + AI_interview × 0.40` (each arm 0–100).  
**Typical unlock to Stage 5:** combined rules + floors (e.g. aptitude ≥ 55, DSA ≥ 60, **AI interview ≥ 60**)—see `buildTechnicalScorecard()` and `PRD.md (§11 Verification scoring)`.

**After AI interview (v2):** Completing the session sets `Interview.status` to **`completed`**, runs **`evaluateFullInterviewMultiPass`** (three parallel **`evaluateFullInterview`** calls, merged scores and strictest claim-credibility risk), persists **`evaluationPassCount`** and **`evaluationScoreVariance`**, then **`recordAiInterviewSubmittedForAdminReview`** — verification stage **`expert_interview`** is **`pending_review`** until an admin **`POST /api/admin/ai-interview-queue/:id/approve`** (unlocks **`human_expert_interview`**, may waive first paid attempt) or **`.../reject`** (**`failed`**). Learners see this in **`VerificationFlow`**; scoring is visible, but Stage 5 is blocked until approval.

---

## 3. AI & ML stack (what we actually use)

| Layer | Technology | Role |
|-------|------------|------|
| **LLM (SDK)** | Google **Gemini** via `@google/genai` | All interview intelligence |
| **Fast agent calls** | **`gemini-2.0-flash`** | Concept extraction, prefetch question suggestions, cheap JSON |
| **Balanced agents** | **`gemini-2.5-flash`** | Weakness, discrepancy, reasoning-behavior, sprint questions, rubric follow-ups |
| **Final interview evaluation (v2)** | **`gemini-2.5-pro`** | Full-session JSON eval in `evaluateFullInterview()` — **deep** tier; completion path calls it **three times in parallel** and merges numerics in **`evaluateFullInterviewMultiPass()`** (`evaluationService.ts`) |
| **Legacy / v1 path** | **`gemini-2.5-flash`** | `evaluateInterview()` in `ai.service.ts` (transcript + optional per-question rubric) |
| **Other product AI** | Same `GEMINI_API_KEY` | Resume parsing, assignments, etc. (`ai.service.ts`) |

**Required for production AI features:** `GEMINI_API_KEY` on the API host.

**Code anchors:** `server/src/services/interview/agents.ts` (tiers + agents + `evaluateFullInterview`), `server/src/services/interview/orchestrator.ts` (v2 flow), `server/src/services/ai.service.ts` (`evaluateInterview`, `conductInterviewPrompt`).

---

## 4. Adversarial interview engine (v2) — product shape

- **Sprints:** 3 × **Project Defense → Foundations → System Design** (personas: curious lead, socratic mentor, senior peer).
- **Capacity:** Up to **15** Q&A exchanges (5 per sprint), then finalize.
- **Per-turn pipeline (parallel):** Weakness agent, concept agent, discrepancy (resume vs answer), reasoning-behavior agent → **`applyReasoningHonestyCap`** (flexible + calibrated reasoning softens interrogation tone).
- **Follow-up priority (v2):** (1) **High-severity discrepancy** with new `resumeClaim` (not already in `probedClaims`) unless **forced sprint**; (2) **High-severity weakness** unless forced sprint; (3) **Question-bank follow-up deepen** (`adaptFollowup`) when weakness is not high and templates remain; (4) **Prefetch** only if **`isStillRelevant`** to committed answer + concepts; (5) **Sprint question** via `generateSprintQuestion` — load **`findFollowupsForQuestionText`** for the new line. **Same weakness type + high severity twice in a row** → **forced sprint** (`pivoting: true`) to avoid interrogation loops.
- **Transcript fragments:** Answers under **20 characters**, or **20–49 characters** without sentence-ending punctuation, get a clarification prompt **without** running agents or advancing counts (`fragmentRetry` in API).
- **State:** Stored in `Interview.questionPlan` JSON (`sprint`, `history`, `weaknesses`, `reasoningSignals`, `probedClaims`, `currentQuestionFollowups`, `consecutiveHighWeaknessCount`, `turnLog`, etc.).
- **Legacy v1:** Fixed question plans from static arrays or DB (`QUESTION_BANK_SOURCE=static|db`), `POST /api/interview/start` + `respond`; still in codebase for compatibility.

---

## 5. Voice & media stack

| Capability | Target / spec | Repo status (April 2026) |
|------------|---------------|---------------------------|
| **STT (verification ExpertInterviewStage)** | Accurate, segmented capture without coupling to live partials | **Primary:** **`useWhisperSession`** — browser records audio in segments with pause detection, **`POST /api/interview/transcribe`** (**OpenAI Whisper**, `whisper.service.ts`). UI guides “pause ~1.5s” to finalize segments; client debounces TTS tail so model audio is not transcribed as the user. |
| **STT (alternate hook, not wired to Expert stage UI)** | Live streaming + prefetch | **`useDeepgramSession.ts`** + **`GET /api/interview/deepgram-token`** (**nova-3** JWT) + **`/v2/partial`** for prefetch — **not imported** by `ExpertInterviewStage.tsx` today; reserved for future live room UX or other surfaces. |
| **TTS** | **Cartesia** primary → **ElevenLabs** → browser `speechSynthesis` | **`tts.service.ts`**: Cartesia first, then ElevenLabs; **`200` + `{ fallback: true, text }`** for browser TTS. |
| **Filler phrases** | Instant masking before main TTS | **`warmInterviewFillerCache()`** on server startup pre-synthesizes MP3s; **`GET /api/interview/tts-filler`** returns **cached buffer** when available, else live TTS. |

**Optional env:** `OPENAI_API_KEY` (**required** for segmented STT in prod), `DEEPGRAM_API_KEY` (alternate live path only), `ELEVENLABS_*`, `CARTESIA_*` (see `server/.env.example`).

---

## 6. APIs (interview)

**v2 (primary for new sessions):**

- `POST /api/interview/v2/start` — `{ jobRole, experienceLevel? }` → first question + sprint metadata.
- `POST /api/interview/v2/turn` — body may include **`turnId`** (client UUID); response echoes **`turnId`** for stale-response discard. Optional telemetry: **`inputMode`** (`voice` \| `typed`), **`pasteCount`**, **`timeToSubmitSeconds`**, **`whisperLatencyMs`** (segment STT latency for **`turnLog`**), **`audioUrl`**, **`transcriptionConfidence`**. Fire-and-forget **`handlePartialTranscript`** on the **full** answer (same prefetch warmup as partials). Response may include **`pivoting`**, **`fragmentRetry`**, **`timeExpired`** (when the 30-minute cap triggers completion), and **`acknowledgement`** (split from main **`response`** for sequential TTS).
- `POST /api/interview/v2/partial` — STT partials for prefetch only.
- `POST /api/interview/:id/request-review` — candidate dispute / second look (**auth**, **job-seeker**): **`reason`** 10–500 chars; within **7 days** of completion; **409** if already requested; sets **`reviewRequestedAt`**, **`reviewRequestReason`**, **`reviewFlag`**, **`reviewReason: candidate_dispute`**.
- `GET /api/interview/deepgram-token` — browser STT credential.
- `POST /api/interview/tts` — AI voice line (ElevenLabs or fallback flag).
- `GET /api/interview/tts-filler` — filler line.
- `POST /api/interview/transcribe` — **Whisper** transcription of user audio (multipart); used by expert stage segmented capture.

**Admin (human gate):** `GET /api/admin/ai-interview-queue/pending`, `POST /api/admin/ai-interview-queue/:id/approve`, `POST .../reject` — see `humanInterviewGate.service.ts`.

**Admin (interview analytics & replay):** `GET /api/admin/questions/analytics` — grouped **`InterviewQuestionResult`** stats joined to **`InterviewQuestionBank`**, **`discriminationFlag`** (`too_hard` / `too_easy` / `good`). `GET /api/admin/interviews/:id/replay` — interview summary, **`messages`**, **`questionResults`**, **`turnLog`** from `questionPlan[0]`, **`ProctoringEvent`** rows (register **`/interviews/pending-review`** before **`:id`** routes). UI: **`AIInterviewReview`** (replay dialog + analytics table) and **`InterviewReplayView.tsx`**.

**v1 (legacy):** `POST /api/interview/start`, `POST /api/interview/respond`, result endpoints—as documented in `PRD.md` (Part D) `#part-b--detailed-specification` Appendix A.

**Frontend:** `src/pages/verification/stages/ExpertInterviewStage.tsx` — **`useWhisperSession`** (passes **`whisperLatencyMs`** into **`onFinal`** for **`/v2/turn`**), **`useProctoringRiskMonitor`**, client **`turnId`** with **stale discard on response and again after acknowledgement TTS / gap / before main question TTS**, **~5s silence nudge** while listening, **`timeExpired`** banner, **request-review** UI after completion. **`useDeepgramSession.ts`** exists but is **not** mounted on the expert stage today.

**Candidate result metadata:** `GET /api/interview/:id/result` includes **`completedAt`**, **`reviewRequestedAt`** (for gating the review CTA).

---

## 7. Evaluation output & badges

- **v2:** `evaluateFullInterview(..., meta)` receives **`coverageRatio`** (unique weakness types ÷ question turns), **`experienceLevel`**, **`jobRole`**. Gemini **`gemini-2.5-pro`** prompt asks for:
  - **`claim_credibility_risk`** / **`claim_credibility_detail`** (resume substantiation),
  - **`engineering_signal`** / **`engineering_signal_detail`** (ability separate from claim disputes),
  - **`confidence_calibrated`** (low coverage → conservative wording).
- **Persisted on `Interview`:** `totalScore`, `badgeLevel`, `finalVerdict`, `scoreBreakdown` (full JSON), plus **`coverageRatio`**, **`claimCredibilityRisk`**, **`engineeringSignal`**, **`integrityFlag`**, **`riskScore`** (proctoring aggregate on v2 completion), **`evaluationPassCount`**, **`evaluationScoreVariance`** (JSON array of raw pass scores).
- **Per-question (v2):** On completion, **`InterviewQuestionResult`** rows are created from **`per_question_scores`** in the merged evaluation (aligned to user messages by index).
- **Thresholds (global):** Elite ≥ 90, Gold ≥ 75, Silver ≥ 60, else Not Verified. Overall score clamped **0–100** in orchestrator.
- **Failure handling:** If **`evaluateFullInterview`** returns null/empty (v2), orchestrator applies a **canonical low neutral JSON** (score ~50, split-report fields defaulted) before persisting. v1 `evaluateInterview` failures follow long PRD §3 (`pending_review` where applicable).
- **Authenticity:** Prompt-level `authenticity_concern` + **anti-gaming** (`aiInterviewAntiGaming.service.ts`), including **formulaic opener** heuristic (“Great question…”, “Certainly…”, “Of course…”).

---

## 8. Integrity: proctoring & anti-gaming

- **Client capture (v2):** **`ExpertInterviewStage`** uses **`useProctoringRiskMonitor`** (tab/visibility + optional lightweight vision on **`proctorVideoRef`**); events POST to **`/api/proctoring/alerts`** with **`testType: "ai_interview"`** and **`sessionId`** = interview id.
- **v1 completion (`POST /respond`):** Proctoring aggregates + **anti-gaming** points are merged into **`Interview.integrityFlag`** and **`riskScore`** (and related fields) via `integrityFlagFromViolationAggregate`, `integrityFlagFromAntiGamingPoints`, `mergeIntegrityFlags` in **`interview.ts`** — see `aiInterviewProctoringRisk.service.ts`, `aiInterviewAntiGaming.service.ts`.
- **v2 completion (`orchestrator.ts`):** Before final **`prisma.interview.update`**, the same merge pattern runs: **`ProctoringEvent`** rows for the interview → proctoring flag; **anti-gaming** from stored user messages + **`authenticity_concern`**; **`mergeIntegrityFlags`**; **`riskScore`** from proctoring violation total. **`turnLog`** rows include telemetry used for traceability (paste, time-to-submit, answer snapshot).
- **Anti-gaming (model + heuristics):** **`authenticity_concern`** in eval JSON; **`formulaic_opener`** and related signals in **`aiInterviewAntiGaming.service.ts`**; v2 path updates message flags where patches apply and feeds integrity merge.

---

## 9. Data & configuration

- **Question bank:** `InterviewQuestionBank` includes **`followups`** JSON (`string[]`) for deepening probes. Static **`ROLE_PLANS`** / **`HR_QUESTIONS`** carry optional **`followups`**; **`questionBankService.ts`** resolves follow-ups by prompt match for v2. **`QUESTION_BANK_SOURCE`**: static (default) or **db**; DB **`buildQuestionPlan`** selects `followups` column; seed **`interviewQuestionBank.seed.ts`** writes follow-ups from static rows. Admin **POST/PATCH `/api/admin/questions`** accepts **`followups`**.
- **Per-question results:** `InterviewQuestionResult` — written on **v1** and **v2** completion (when evaluation returns **`per_question_scores`**).
- **Admin:** Pending review queue, re-evaluate, question CRUD, **question analytics**, **session replay** — see main `PRD.md` §3.4 and long PRD.
- **Multi-pass metadata (schema):** `Interview.evaluationPassCount`, `Interview.evaluationScoreVariance` — migration **`20260407180000_ai_interview_multipass_metadata`**.

---

## 10. Operator checklist (minimal)

1. Set **`GEMINI_API_KEY`** (required for AI interview intelligence).
2. Set **`OPENAI_API_KEY`** (required for **segmented STT** on the expert interview stage via Whisper).
3. Set **`CARTESIA_API_KEY`** + **`CARTESIA_VOICE_ID`** for primary TTS and **filler pre-cache** at startup (recommended).
4. Set **`ELEVENLABS_*`** as TTS fallback if Cartesia fails.
5. **`DEEPGRAM_API_KEY`** — optional; only needed if product wires **`useDeepgramSession`** for live STT.
6. Confirm **`QUESTION_BANK_SOURCE`** and run **`npm run seed:interview-bank`** if using DB bank.

**Migration (schema):** apply `server/prisma/migrations/20260407120000_ai_interview_followups_split_report/` (Interview bank `followups`, Interview split-report columns) and **`20260407180000_ai_interview_multipass_metadata`** (`evaluationPassCount`, `evaluationScoreVariance`).

---

## 11. Known gaps (high level)

Remaining vs product wishlist (not blockers for current production path):

- **Deepgram live path** still unused in **`ExpertInterviewStage`** (Whisper segmented remains default for verification accuracy).
- Optional stricter **TTS `503`** when all cloud providers fail (today: browser **`speechSynthesis`** fallback contract).
- Richer **ExpertInterviewStage** polish (e.g. review countdown UI, Whisper confidence UX) as needed.

**Recently closed (v1.3):** v2 **integrity merge**; **multi-pass** evaluation; **30-minute** cap + **`timeExpired`**; **turnId** checks through acknowledgement TTS; **turnLog** timing + **`whisperLatencyMs`**; **speculative warmup** on full turn; **silence nudge**; **candidate review request**; **admin question analytics** + **session replay**.

---

## 12. Implementation changelog — shipped in repo

| Area | Change |
|------|--------|
| **Schema** | `InterviewQuestionBank.followups`; `Interview.coverageRatio`, `claimCredibilityRisk`, `engineeringSignal`. Migration folder `20260407120000_ai_interview_followups_split_report`. |
| **Agents** | Honest-admission regex + **`calibration_success`** / **`explore_depth`**; discrepancy returns **`resumeClaim`**, **`actualStatement`**; **`ReasoningBehaviorOutput`** + **`applyReasoningHonestyCap`**; **`adaptFollowup`**; **`evaluateFullInterview`** extended with coverage + split-report JSON + experience rubric block. |
| **Services** | **`evaluationService.ts`**: `computeWeaknessCoverageRatio`; **`questionBankService.ts`**: `findFollowupsForQuestionText`. |
| **Orchestrator** | Fragment guard; consecutive same-type **high** weakness guard → **forced sprint** + **`pivoting`**; full priority chain + **`probedClaims`**; **`turnLog`**; sprint advance resets streak + loads opener follow-ups; completion persists split-report fields. |
| **TTS** | **`warmInterviewFillerCache()`** in **`server.ts`**; **`getPreCachedFillerMp3`** in tts-filler route. |
| **Routes** | **`v2/turn`**: optional **`turnId`** + telemetry fields; **`interview.ts`** DB plan includes **`followups`**; **`transcribe`** for Whisper STT. |
| **Human gate** | **`recordAiInterviewSubmittedForAdminReview`**: queue email + **`expert_interview`** **`pending_review`** until admin approve/reject. |
| **Admin** | Question create/patch: **`followups`**. |
| **Static data** | Backend **`ROLE_PLANS`** entries include **2 follow-ups** each; sample HR follow-ups. |
| **Anti-gaming** | **`formulaic_opener`** signal. |
| **Frontend** | **`ExpertInterviewStage`**: **`useWhisperSession`** STT, client **`turnId`**, stale-response skip, **`pivoting`** banner, **`useProctoringRiskMonitor`**. |
| **Antigravity parity (v1.3)** | **`evaluationService.ts`**: **`evaluateFullInterviewMultiPass`** (3× parallel, merged scores, strictest claim credibility). **`Interview`**: **`evaluationPassCount`**, **`evaluationScoreVariance`**. |
| **Orchestrator (v1.3)** | v2 completion: **integrity merge** (proctoring + anti-gaming → **`integrityFlag`**, **`riskScore`**); **`InterviewQuestionResult`** from **`per_question_scores`**; **`turnLog`** timing + snapshot fields; **`timeExpired`** when **`completionReason === time_limit`**. |
| **Routes (v1.3)** | **`v2/turn`**: **`whisperLatencyMs`**, fire-and-forget **`handlePartialTranscript`** on full answer; **`request-review`** validation (409 duplicate). **`GET /:id/result`**: **`completedAt`**, **`reviewRequestedAt`**. |
| **Admin (v1.3)** | **`GET /admin/questions/analytics`** (join bank, discrimination flags); **`GET /admin/interviews/:id/replay`**; UI **`InterviewReplayView`** + **`AIInterviewReview`** replay + analytics table. |
| **Frontend (v1.3)** | Silence nudge; **turnId** re-check after ack / gap / before question TTS; **`whisperLatencyMs`** from last segment; **time-expired** banner; **request-review** form. |

---

## 13. Document map

| Need | Read |
|------|------|
| This overview + **what shipped** (§12) | **This file** |
| Full product + checklist + voice + §16 code status | `PRD.md` (Part D) `#part-b--detailed-specification` |
| Scorecard math & stage floors | `PRD.md (§11 Verification scoring)` |
| Whole product context | `PRD.md` §3.4 |

*Consolidated for stakeholders who want one efficient doc; the long PRD remains authoritative for edge cases and audit.*

---

<a id="part-b--detailed-specification"></a>

## Part B — Detailed specification

# Sections 1–10 — Pro Upgrade specification

## 1) Question Bank Governance

### 1.1 Problem (baseline)

All questions live in static arrays in `server/src/routes/interview.ts` (`ROLE_PLANS`, `HR_QUESTIONS`). Admins cannot add, edit, or retire questions without a deploy.

### 1.2 Prisma: `InterviewQuestionBank`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` `@id` `@default(uuid())` | Primary key |
| `role` | `String` | e.g. `frontend`, `backend`, `fullstack`, `qa`, `ml`, `devops`, `data`, `mobile`, `software` |
| `experienceLevel` | `String` | `junior` \| `mid` \| `senior` (see §4) |
| `type` | `String` | `conceptual` \| `scenario` \| `problem_solving` \| `behavioral` |
| `prompt` | `String` | Question text shown to candidate |
| `keyPoints` | `Json` | `string[]` — ideal answer criteria for evaluator |
| `difficulty` | `Int` | 1 (easy)–5 (hard), for calibration / analytics |
| `isActive` | `Boolean` | `@default(true)` — soft retire |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |
| `createdBy` | `String?` | Admin user id (optional) |
| `tags` | `String[]` | Optional e.g. `["react","hooks"]` |

**Indexes (recommended):** `[role, experienceLevel, type, isActive]` for selection queries.

### 1.3 Prisma: `InterviewQuestionResult`

Per-question scored outcome, linked to the candidate’s answer message (not a replacement for `InterviewMessage`).

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` `@id` `@default(uuid())` | Primary key |
| `interviewId` | `String` | FK → `Interview` |
| `messageId` | `String` | FK → `InterviewMessage` (the user answer row) |
| `questionBankId` | `String?` | FK → `InterviewQuestionBank` (null for legacy static-bank interviews) |
| `questionIndex` | `Int` | 0-based index in this interview’s plan |
| `questionType` | `String` | Copied from plan at interview time |
| `scoreConceptual` | `Float?` | 0–100 |
| `scoreReasoning` | `Float?` | 0–100 |
| `scoreCommunication` | `Float?` | 0–100 |
| `rationale` | `String?` | 1–2 sentence AI rationale |
| `keyPointsHit` | `String[]` | Key points addressed |
| `keyPointsMissed` | `String[]` | Key points missing |
| `flagAntiGaming` | `Boolean` | `@default(false)` (see §8) |
| `flagReason` | `String?` | Anti-gaming / authenticity flag reason |

### 1.4 Admin API (`requireAdmin`)

Base path: **`/api/admin/questions`**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/questions` | List with filters: `?role=&level=&type=&isActive=&tag=` |
| `POST` | `/api/admin/questions` | Create: `role`, `experienceLevel`, `type`, `prompt`, `keyPoints[]`, `difficulty`, `tags[]` |
| `PATCH` | `/api/admin/questions/:id` | Update `prompt`, `keyPoints`, `difficulty`, `isActive`, `tags` |
| `DELETE` | `/api/admin/questions/:id` | **Soft delete:** `isActive=false` only (no hard delete) |
| `GET` | `/api/admin/questions/analytics` | Per-question stats: avg score, discrimination proxy, usage count |

### 1.5 Seed / migration script (`scripts/seedQuestions.ts`)

One-time script:

1. Import or read current `ROLE_PLANS` and `HR_QUESTIONS` from `server/src/routes/interview.ts` (or a shared module extracted for import).
2. Set `experienceLevel = 'mid'` for all seeded rows (safe default).
3. Set `difficulty` by type: `behavioral=1`, `conceptual=2`, `scenario=3`, `problem_solving=4`.
4. Insert into `InterviewQuestionBank` with `isActive=true`.

### 1.6 Rollback-safe source flag: `QUESTION_BANK_SOURCE`

- **Env (server):** `QUESTION_BANK_SOURCE=static` \| `db`
- **Default:** `static` until DB seed is verified in staging/production.
- **`.env.example`:** document the flag and rollout steps.

### 1.7 `buildQuestionPlan(role, experienceLevel)` (DB + fallback)

When `QUESTION_BANK_SOURCE=db`:

1. **Tech (7):** `WHERE role = ? AND experienceLevel = ? AND type != 'behavioral' AND isActive = true` → `ORDER BY RANDOM() LIMIT 7`.
2. **HR (4):** `WHERE type = 'behavioral' AND isActive = true` → `ORDER BY RANDOM() LIMIT 4`.

If fewer than 7 tech rows are returned, **fall back to static arrays** (current `ROLE_PLANS` / `HR_QUESTIONS`) for that interview so candidates are never blocked.

Persist the resolved plan on `Interview.questionPlan` JSON (include `id` from bank when sourced from DB for traceability).

---

## 2) Per-Question Scoring

### 2.1 Gemini JSON output contract (required)

Extend `evaluateInterview()` in `server/src/services/ai.service.ts` to require **aggregate** fields **plus** `per_question_scores`.

```json
{
  "technical_accuracy": 0,
  "depth_of_knowledge": 0,
  "problem_solving": 0,
  "communication_clarity": 0,
  "concept_score": 0,
  "reasoning_score": 0,
  "communication_score": 0,
  "confidence_score": 0,
  "strengths": [],
  "weaknesses": [],
  "final_verdict": "",
  "confidence_level": "High|Medium|Low",
  "authenticity_concern": false,
  "authenticity_reason": "",
  "per_question_scores": [
    {
      "question_index": 0,
      "score_conceptual": 0,
      "score_reasoning": 0,
      "score_communication": 0,
      "rationale": "",
      "key_points_hit": [],
      "key_points_missed": []
    }
  ]
}
```

- `authenticity_*` comes from the anti-gaming prompt addition (§8.3).
- Aggregates remain compatible with existing `computeScore()` weighting unless product explicitly changes weights in the same release.

### 2.2 Finalization write loop (pseudocode)

After successful parse of evaluation JSON on **final** `POST /api/interview/respond`:

```text
for each qs in evaluation.per_question_scores:
  resolve messageId = candidateAnswerMessageIdForIndex(qs.question_index)
  // messageId must map to the user message for that question index (not AI prompt rows)
  create InterviewQuestionResult {
    interviewId,
    messageId,
    questionBankId: plan[qs.question_index].questionBankId ?? null,
    questionIndex: qs.question_index,
    questionType: plan[qs.question_index].type,
    scoreConceptual: qs.score_conceptual,
    scoreReasoning: qs.score_reasoning,
    scoreCommunication: qs.score_communication,
    rationale: qs.rationale,
    keyPointsHit: qs.key_points_hit,
    keyPointsMissed: qs.key_points_missed,
    flagAntiGaming: /* from message-level signals + evaluator if needed */,
    flagReason: /* optional aggregate */
  }
```

**Implementation note:** Do not use a fragile `transcriptMessages[question_index * 2 + 1]` mapping in production—derive `messageId` by iterating transcript in order and pairing each AI question with the following user message, or store `questionIndex` on `InterviewMessage` when creating user rows.

### 2.3 Extended `GET /api/interview/:id/result`

Add **`perQuestionScores`** for admin / review tools (not shown to candidates — §7):

```json
{
  "totalScore": 78,
  "badgeLevel": "Gold Verified",
  "finalVerdict": "...",
  "scoreBreakdown": {},
  "perQuestionScores": [
    {
      "questionIndex": 0,
      "questionType": "conceptual",
      "questionPrompt": "Explain closures in JS",
      "scoreConceptual": 82,
      "scoreReasoning": 75,
      "scoreCommunication": 90,
      "rationale": "Candidate demonstrated clear understanding...",
      "keyPointsHit": ["lexical scope", "closure over variables"],
      "keyPointsMissed": ["garbage collection implication"]
    }
  ]
}
```

---

## 3) Fallback Evaluation

### 3.1 Canonical fallback payload (exact)

On Gemini failure inside `evaluateInterview()` catch, return **this** JSON string (values fixed):

```json
{
  "technical_accuracy": 5,
  "depth_of_knowledge": 5,
  "problem_solving": 5,
  "communication_clarity": 5,
  "concept_score": 50,
  "reasoning_score": 50,
  "communication_score": 50,
  "confidence_score": 50,
  "strengths": ["Evaluation unavailable — interview flagged for manual review."],
  "weaknesses": ["Evaluation unavailable — interview flagged for manual review."],
  "final_verdict": "PENDING_MANUAL_REVIEW",
  "confidence_level": "Low",
  "fallback_triggered": true,
  "fallback_reason": "gemini_timeout",
  "per_question_scores": []
}
```

- Set `fallback_reason` to the actual error message or a normalized code (e.g. `gemini_timeout`, `gemini_5xx`).

### 3.2 Interview row when `fallback_triggered === true`

| Field | Value |
|-------|--------|
| `totalScore` | `50` (neutral) |
| `badgeLevel` | `Pending Review` |
| `status` | `pending_review` (**new** interview status; migrate from string-only if needed) |
| `reviewFlag` | `true` (**new** `Boolean` on `Interview`) |
| `reviewReason` | `gemini_evaluation_failed` (**new** `String?`) |

Do **not** treat as normal `completed` for candidate-facing badges until re-eval completes.

### 3.3 Candidate-facing copy (API + UI)

When `status === pending_review`, result payload should include (or UI maps from):

> **Your interview responses have been recorded successfully. Our evaluation system encountered a technical issue — your interview has been flagged for manual review and you will receive your result within 24 hours. This does not affect your application status.**

### 3.4 Admin queue + re-evaluation

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/interviews/pending-review` | All `Interview` where `status = pending_review`, `ORDER BY completedAt ASC` |
| `POST /api/admin/interviews/:id/re-evaluate` | Re-run `evaluateInterview()` using **stored** transcript + plan; on success, clear `pending_review`, set real scores, clear `reviewFlag` as appropriate |

---

## 4) Role + Experience Calibration

### 4.1 Candidate UX: `experienceLevel`

Required alongside `jobRole` on start:

| Value | Label |
|-------|--------|
| `junior` | 0–2 years of experience |
| `mid` | 2–5 years of experience |
| `senior` | 5+ years of experience |

### 4.2 API: `POST /api/interview/start`

Request body:

```json
{
  "jobRole": "Backend Developer",
  "experienceLevel": "senior"
}
```

- Persist `experienceLevel` on `Interview`.
- Pass into `buildQuestionPlan(role, experienceLevel)` for DB selection.

### 4.3 Evaluator prompt: rubric calibration block

Append to `evaluateInterview()` system prompt based on `experienceLevel`:

| Level | Instruction |
|-------|-------------|
| **junior** | Foundational understanding, clear communication, willingness to learn. Score 70+ for correct core concepts even if depth is limited. Do not penalize missing advanced edge cases. |
| **mid** | Solid practical application and trade-off reasoning. Expect familiarity with tooling and common patterns. Score 70+ for correct application with reasonable trade-off awareness. |
| **senior** | Depth, systems thinking, trade-off articulation, mentoring signal. Score 70+ only with ownership and architectural awareness. Penalize surface-level answers. |

### 4.4 Recruiter-facing label (uniform badge thresholds)

Badge cutoffs stay **global**: Elite ≥90, Gold ≥75, Silver ≥60, else Not Verified.

Add recruiter copy:

> This score reflects performance against a **[Junior / Mid-Level / Senior]** benchmark. Scores are not directly comparable across experience levels.

---

## 5) Voice Transcription Quality

### 5.1 Confidence thresholds (`SpeechRecognition` result confidence, 0–1)

| Range | Behavior |
|-------|----------|
| **0.85 – 1.0** | Auto-accept into answer field; no warning |
| **0.60 – 0.84** | Show yellow inline: *Low confidence transcription — please review before submitting.* |
| **&lt; 0.60** | Do not auto-fill. Show: *We could not reliably transcribe your response. Please type your answer or try speaking again.* Clear stale auto text |

### 5.2 Five-second review window

After a voice segment finalizes:

- Show editable textarea with transcript.
- **Submit disabled** for **5 seconds** with countdown: *Review your answer — submitting in 5s*.
- Candidate may edit; **evaluated text = final textarea** (not raw audio).

### 5.3 Typed input always available

- Toggle: **Switch to typed input** at all times.
- Persist per answer: `inputMode`: `voice` \| `typed` on `InterviewMessage`.
- Evaluator does not treat modes differently.

### 5.4 `InterviewMessage` additions

| Field | Type | Purpose |
|-------|------|---------|
| `transcriptionConfidence` | `Float?` | 0–1 when voice; null if typed |
| `inputMode` | `String` | `@default("typed")` — `voice` \| `typed` |
| `rawTranscript` | `String?` | Machine transcript **before** candidate edits |

`audioUrl` remains; when voice is used, continue uploading when applicable.

---

## 6) Proctoring Thresholds

### 6.1 Violation counts (interview completion)

**Do not** compute or persist a weighted 0–100 proctoring “risk score.” Instead:

1. **Per-signal counts:** For each proctoring event type, count how many times that signal was logged for the interview session (`sessionId = interviewId`, `testType = ai_interview`). Each stored `ProctoringEvent` row is one log; the integer field `riskScore` on that row is the **1-based violation index for that signal type** in the session at log time (legacy column name).
2. **Persist on `Interview`:** `riskScore Float?` holds the **total number of proctoring alert rows** for that interview (for admin sorting — not a calibrated risk index). `integrityFlag String?` is derived from aggregated counts (and merged with anti-gaming severity — see below).

### 6.2 Integrity bands (from counts + anti-gaming)

**Proctoring-only tiering** (from raw event rows for the session):

- **`review_recommended`:** e.g. `maxPerType ≥ 3` **or** `total rows ≥ 8`
- **`review_required`:** e.g. `maxPerType ≥ 5` **or** `total rows ≥ 18`
- **`integrity_violation`:** e.g. `maxPerType ≥ 10` **or** `total rows ≥ 40`

**Anti-gaming** still produces a 0–100-style point roll-up from answer-quality signals; that maps to the **same** flag scale, and the **stricter** of (proctoring flag, anti-gaming flag) wins.

| Outcome | Action |
|---------|--------|
| **No flag** | Normal flow |
| **`review_recommended`** | Soft flag; yellow on admin; **shortlist not blocked** (unless other gates fail) |
| **`review_required`** | **Shortlist blocked** until admin clears |
| **`integrity_violation`** | Interview treated as integrity failure; `buildTechnicalScorecard()` may use **`ai_interview_score = 0`** per product rules; admin may override |

### 6.3 Admin override + audit log

New table **`ProctoringReviewLog`**:

- `id`, `interviewId`, `adminId`, `action` (e.g. approve / reject), `note` (required), `createdAt`

Admin UI shows: event timeline, **per-signal counts**, total rows, current `integrityFlag`, **Override** with mandatory note — every action appends a log row.

---

## 7) Candidate Explainability

### 7.1 Result screen — what to show

| Element | Rule |
|---------|------|
| **Badge** | Large: Elite / Gold / Silver / Not Verified — immediately on completion |
| **Numeric score** | Show **only if** badge ≠ Not Verified (hide low numbers for rejected to reduce drop-off) |
| **Final verdict** | Full `final_verdict`, max ~3 sentences, all outcomes |
| **Strengths** | Bullets, header: *What you did well* |
| **Areas to improve** | Bullets; **do not** use the word “weaknesses” in UI |
| **Per-question breakdown** | **Never** for candidate — admin only |
| **Badge on profile** | Persistent with verification timestamp |
| **Retake** | Copy: *30-day cooldown before retake is available*; retake resets badge |

### 7.2 `pending_review` UX

- Neutral **Under Review** state (gray — not a verification badge).
- Show §3.3 message; **no score or verdict**.
- *Expected result: within 24 hours*
- Email when admin finishes re-eval and sets real outcome.

### 7.3 One-time review request (7-day gate)

New `Interview` fields:

| Field | Purpose |
|-------|---------|
| `reviewRequestedAt` | When candidate requested |
| `reviewRequestReason` | Short text, max 500 chars |
| `reviewOutcome` | `confirmed` \| `adjusted` |
| `reviewOutcomeNote` | Admin note surfaced to candidate |

Rules:

- **Once** within **7 days** of completion.
- Sets queue reason `candidate_dispute` (or equivalent); admin sees transcript + per-question scores; may adjust or confirm score.

---

## 8) Anti-Gaming

### 8.1 Signals

| Signal | Logic |
|--------|--------|
| Too long | `length > 2000` → flag + anti-gaming points (§6.2 merge) |
| Too short | Technical Q, `length < 20` → anti-gaming points |
| Repetition | Jaccard similarity between answer pairs; if **any pair &gt; 0.6** → flag repetitive |
| Paste | Frontend `paste` listener → increment `pasteCount` on message / interview; align with existing proctoring copy-paste events |
| Homogeneous structure | Evaluator notes identical patterns (e.g. every answer starts *Great question…*) → reflect in `authenticity_concern` |
| Too fast | `timeToSubmitSeconds &lt; 5` from question shown → implausible speed flag |

### 8.2 `InterviewMessage` additions

| Field | Type |
|-------|------|
| `answerLengthChars` | `Int` |
| `pasteCount` | `Int` `@default(0)` |
| `timeToSubmitSeconds` | `Int?` |
| `flagAntiGaming` | `Boolean` `@default(false)` |
| `flagReason` | `String?` (comma-separated signal keys) |

### 8.3 Evaluator prompt addition

Append:

> Also assess answer authenticity. Flag if: (1) answers appear AI-generated (overly structured, formulaic intros such as “Great question”), (2) answers share identical structure across questions, or (3) content is clearly off-topic. Return **`authenticity_concern`**: true/false and **`authenticity_reason`**: brief string if true.

### 8.4 Aggregation

Before `computeScore()` at finalization:

1. Run `computeAntiGamingRisk(transcript, messages)` (new helper, e.g. `server/src/services/aiInterviewAntiGaming.service.ts` or `ai.service.ts`).
2. Merge with evaluator `authenticity_concern`.
3. Update `InterviewMessage.flagAntiGaming` / `flagReason` and set `Interview` violation totals / `integrityFlag` per §6.

---

## 9) Implementation checklist (24 tasks)

Paths match **this repo** (PDF used `client/` — here `src/`).

| # | Task | File / location |
|---|------|-----------------|
| 1 | Add `InterviewQuestionBank` model | `server/prisma/schema.prisma` |
| 2 | Add `InterviewQuestionResult` model | `server/prisma/schema.prisma` |
| 3 | Extend `InterviewMessage` (transcription + anti-gaming fields) | `server/prisma/schema.prisma` |
| 4 | Extend `Interview` (experience, review, violation totals, integrity flags) | `server/prisma/schema.prisma` |
| 5 | Add `ProctoringReviewLog` model | `server/prisma/schema.prisma` |
| 6 | Run Prisma migrate | CLI / `server/prisma/migrations/` |
| 7 | Implement `scripts/seedQuestions.ts` + wire in `server/package.json` | `scripts/seedQuestions.ts` |
| 8 | Document `QUESTION_BANK_SOURCE` + rollout | `.env.example`, `docs/DEPLOYMENT_*.md` if needed |
| 9 | `buildQuestionPlan(role, experienceLevel)` + DB + static fallback | `server/src/routes/interview.ts` |
| 10 | `POST /api/interview/start` accept `experienceLevel` | `server/src/routes/interview.ts` |
| 11 | Finalization: persist `InterviewQuestionResult` rows + stable message mapping | `server/src/routes/interview.ts` |
| 12 | `evaluateInterview()` — per-question JSON + calibration + authenticity | `server/src/services/ai.service.ts` |
| 13 | Canonical fallback payload + `pending_review` finalization branch | `server/src/services/ai.service.ts` + `interview.ts` |
| 14 | `computeAntiGamingRisk()` | `server/src/services/ai.service.ts` or `server/src/services/aiInterviewAntiGaming.service.ts` |
| 15 | `computeInterviewProctoringRiskScore()` (event table → points) | `server/src/services/verificationScoring.service.ts` or new `aiInterviewProctoring.service.ts` |
| 16 | `buildTechnicalScorecard()` — `ai_interview_score = 0` when `integrity_violation` | `server/src/services/verificationScoring.service.ts` |
| 17 | Extend `GET /api/interview/:id/result` with `perQuestionScores` | `server/src/routes/interview.ts` |
| 18 | `GET /api/admin/interviews/pending-review` + `POST .../re-evaluate` | `server/src/routes/admin.ts` |
| 19 | Admin question bank CRUD + analytics (5 routes) | `server/src/routes/admin.ts` |
| 20 | Admin UI: question bank + pending interview queue + override + logs | `src/pages/admin/AdminDashboard.tsx` and/or new admin components |
| 21 | `experienceLevel` selector on start | `src/pages/verification/stages/ExpertInterviewStage.tsx` |
| 22 | Transcription confidence UI + 5s edit window + typed toggle | `ExpertInterviewStage.tsx` |
| 23 | Paste listener + question timestamp + `timeToSubmitSeconds` + payload fields | `ExpertInterviewStage.tsx` + `interview.ts` respond body |
| 24 | Result UX: explainability, `pending_review`, 7-day review request + emails | `ExpertInterviewStage.tsx` and/or `src/components/interview/InterviewResult.tsx` (extract if needed) + email util |

---

## 10) Dependency summary

| Dependency | Notes |
|------------|--------|
| Prisma | New models + fields; migrations as deployed |
| Gemini | `@google/genai`; model tiers per §14.5 |
| Deepgram | **nova-3** target; STT over browser WebSocket; short-lived JWT from `/v1/auth/grant` (see §13.4 implementation note) |
| Cartesia | Primary TTS — `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` (§12.6) |
| ElevenLabs | Fallback TTS — `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| `QUESTION_BANK_SOURCE` | `static` default; `db` after seed verified |
| Admin auth | `requireAdmin` on admin routes |
| Email | `pending_review` + review-request outcomes |
| Frontend STT | Optional `@deepgram/sdk` if product standardizes on SDK (today: native `WebSocket`) |

---

# Section 11 — Adversarial Interview Engine

## 11.1 Philosophy

The interview probes **failure boundaries of understanding**, not flash-card correctness. Every answer triggers parallel agents; follow-ups are generated in real time from what the candidate just said.

## 11.2 Sprint structure

**Total:** 15 questions across 3 sprints × 5 questions.

| Sprint | Name | Persona | Goal |
|--------|------|---------|------|
| 1 | Project Defense | `curious_lead` | Ownership, decisions, failures — what they actually built |
| 2 | Foundations | `socratic_mentor` | Conceptual depth — reasoning, not trivia |
| 3 | System Design | `senior_peer` | Trade-offs, scaling, failure modes, alternatives |

**Track variants (canonical code):** **Non-technical** uses `NON_TECH_SPRINTS` / `NON_TECH_OPENERS`. **Data (`roleType === "data"`)** uses `DATA_SPRINTS` / `DATA_OPENERS` and passes **`dataTrack` + `dataSubtrack`** into `generateSprintQuestion` and `evaluateFullInterview` (`agents.ts`). **Software** uses `SPRINTS` / `SPRINT_OPENERS` above.

**Openers (fixed when each sprint begins):** Marketing copy below; **canonical strings** for the **software** track are `SPRINT_OPENERS` in **`server/src/services/interview/orchestrator.ts`** (non-tech and data openers live in the same file under their own constants).

1. *Tell me about a project from your background that you're genuinely proud of — what problem were you trying to solve, and why did it matter?*
2. *Let's talk about the technical concepts behind your work. Pick one idea at the core of what you've built — how would you explain it to someone encountering it for the first time?*
3. *Let's think through a design problem. Imagine you're building a system to serve real-time predictions for millions of users — where would you start, and what are the hardest parts to get right?*

## 11.3 Personas (summary)

- **curious_lead:** Curious, non-confrontational; “why that choice?”; ownership and honest failure.
- **socratic_mentor:** Plain-language explanation, think-aloud, acknowledge good reasoning before pushing.
- **senior_peer:** Real constraints, trade-offs, scale (“10x load”), collaborative design tension.

## 11.4 Agent pipeline (every turn)

Executed in parallel after each candidate answer:

| Agent | Role | Model tier (spec) |
|-------|------|-------------------|
| WeaknessAgent | Main reasoning gap | balanced |
| ConceptAgent | Extract technical concepts for prefetch | fast |
| DiscrepancyAgent | Resume vs answer consistency | balanced |
| ReasoningBehaviorAgent | Meta-cognition (structure, adaptability, calibration) | balanced |

**Weakness types:** `missing_step` | `vague` | `incorrect` | `shallow` | `overconfidence`  
**Attack strategies:** `implementation_probe` | `edge_case` | `scaling` | `contradiction` | `step_by_step`  
**Severity:** `high` | `medium` | `low` — sprint context shifts emphasis (see product prose in v3 board).

**Discrepancy output:** `{ conflict, description, severity: "low" | "high" }`  
**Reasoning behavior:** structure score 0–3, clarification behavior, adaptability, confidence calibration.

## 11.5 Follow-up priority

1. Resume discrepancy (`conflict` AND `severity=high`) → `generateDiscrepancyFollowup()`
2. Weakness `severity=high` → `generateWeaknessFollowup()`
3. Else prefetched question (from cache keyed by `interviewId`) if valid
4. Else `generateSprintQuestion()` — aligned to sprint, no repeats from history

## 11.6 Prefetch

On **final** partials from Deepgram (and `/v2/partial`): extract concepts, enqueue ~2 candidate follow-ups in memory (`prefetchCache`), **Flash-only** — no weakness evaluation on partials.

## 11.7 Interview state

Stored in `Interview.questionPlan` JSON (single object in array): `sprint`, `persona`, `sprintName`, `questionCount`, `sprintQuestionCount`, `history[]`, `weaknesses[]`, `reasoningSignals[]`, `lastQuestion`, `interviewStartTime`, plus optional **`trackNonTechnical`**, **`nonTechSubtrack`**, **`trackData`**, **`dataSubtrack`** for calibration (see `orchestrator.ts`).

## 11.8 Sprint progression & termination

- After 5 questions in a sprint → advance; next question is next sprint **opener**.
- **Terminate** when: 15 questions completed **or** sprint 3 exhausted **or** **30 minutes** elapsed since `interviewStartTime` (product rule — verify §16).
- On complete → `evaluateFullInterview()` → persist scores → `complete: true`.

---

# Section 12 — Voice architecture

## 12.1 STT — Deepgram nova-3

- **Transport:** Browser `WebSocket` to `wss://api.deepgram.com/v1/listen` — audio **does not** go through ProvenHire API.
- **Auth:** Backend `GET /api/interview/deepgram-token` returns credentials for the browser (see §13.4 implementation note).
- **Parameters (target):**

```
model: nova-3
language: en
encoding: linear16
sample_rate: <match AudioContext, typically 48000; spec may standardize 16000>
channels: 1
interim_results: true
vad_events: true
endpointing: 1200
utterance_end_ms: 2500
```

- **Buffering:** accumulate `is_final` fragments; flush on `UtteranceEnd` or 5s safety timer; never commit answer on partial alone.

## 12.2 Floor manager

States: `idle` | `user_speaking` | `ai_thinking` | `ai_speaking`.

- **Barge-in:** On `SpeechStarted` while AI is speaking → abort TTS (AbortController), floor → `user_speaking`.
- **Silence nudge (product):** If `user_speaking` & ~5s silence → short filler (“Take your time…”) — optional per §16.

## 12.3 TTS — Cartesia (primary) → ElevenLabs (fallback)

**Cartesia (target):** `POST https://api.cartesia.ai/tts/bytes` with `Cartesia-Version`, `X-API-Key`, body `model_id: sonic-english`, `transcript`, `voice`, `output_format` MP3 44100.

**ElevenLabs (fallback):** stream `eleven_turbo_v2_5` as today.

**Final fallback:** Browser `speechSynthesis`.

## 12.4 Filler-first latency masking

On utterance end: play low-latency filler via `GET /api/interview/tts-filler` + TTS immediately; run agents; abort filler when main response TTS is ready (product ideal). Filler list: “Hmm, interesting.”, “Got it.”, “I see.”, “That makes sense.”, “Alright.”, “Let me think about that.”

## 12.5 Turn ID — stale response protection

Each turn exposes a **`turnId`** (UUID in spec). Frontend keeps `currentTurnId`; discard responses where `response.turn_id !== currentTurnId`. Barge-in increments turn id so in-flight completions drop (spec).

## 12.6 Environment variables

```
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
CARTESIA_VOICE_ID=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
QUESTION_BANK_SOURCE=static
GEMINI_API_KEY=
```

## 12.7 Latency targets (product)

| Step | Target |
|------|--------|
| Filler first chunk | < 100 ms |
| Partial → concept path | < 200 ms |
| Agent pipeline | < 2000 ms |
| Stop speaking → AI audio starts | < 2500 ms (filler covers gap) |

## 12.8 Production voice UX — utterance hygiene and STT echo control

Problems addressed in **April 2026** ship:

| Issue | Mitigation |
|-------|-------------|
| LLM adds acknowledgements (“Thank you for sharing…”) before the real question | **Server:** `sanitizeAiInterviewQuestionText()` in **`server/src/services/interview/orchestrator.ts`** strips leading/trailing pleasantries before persistence, API `response`, and TTS source text. Closing messages when `complete: true` are not modified. |
| Same acknowledgement noise in agent outputs | **Server:** Persona and follow-up prompts in **`server/src/services/interview/agents.ts`** explicitly forbid thanks, praise, and filler before the question. |
| Speaker tail / room pick-up transcribed as the candidate’s answer (“thank you” in the answer panel) | **Client:** After AI TTS ends, **`POST_AI_SPEECH_COOLDOWN_MS`** (~520 ms) delay before re-enabling the mic (**`ExpertInterviewStage.tsx`**). Final Whisper segments are run through **`scrubSttEcho()`** to drop politeness-only lines and strip a leading “thank you / thanks …”. |

These behaviors are **production defaults** alongside Cartesia/ElevenLabs TTS and optional filler audio (**§12.4**).

---

# Section 13 — v2 API routes

All **new** interviews use v2; v1 remains for compatibility (§15).

## 13.1 `POST /api/interview/v2/start`

Body: `{ jobRole, experienceLevel? }`  
Response: `{ interviewId, question, sprint, sprintName, persona, totalSprints: 3, questionsPerSprint: 5 }`.

## 13.2 `POST /api/interview/v2/turn`

Body includes: `interviewId`, `answer`, `inputMode`, optional `transcriptionConfidence`, `audioUrl`, `pasteCount`, `timeToSubmitSeconds`.  
Response includes `response`, `sprint`, `persona`, `complete`, `weakness?`, `questionCount`, **`turnId`**, and when complete: `totalScore`, `badgeLevel`, `evaluation`.

## 13.3 `POST /api/interview/v2/partial`

`{ interviewId, text }` → `{ ok: true }`; background prefetch only.

## 13.4 `GET /api/interview/deepgram-token`

**Spec:** returns a credential for browser STT.

**As implemented (this repo):** `{ "token": string | null, "auth": "bearer" | "token" | null }` — prefers short-lived JWT from Deepgram `POST /v1/auth/grant`, else raw key with `auth: "token"`.

## 13.5 `POST /api/interview/tts`

**Spec:** stream MP3; Cartesia first, then ElevenLabs; `503` if both fail.

**As implemented:** **`server/src/services/tts.service.ts`** — Cartesia (when `CARTESIA_API_KEY` + `CARTESIA_VOICE_ID` set) → ElevenLabs → **`200` JSON** `{ "fallback": true, "text": "..." }` for browser `speechSynthesis` (no hard 503).

## 13.6 `GET /api/interview/tts-filler`

**Spec:** low-latency filler audio.

**As implemented:** Pre-cached MP3 from **`warmInterviewFillerCache()`** at API startup when a TTS provider is configured; response is **`audio/mpeg`** with optional header **`X-Filler-Text`** (URL-encoded phrase). Otherwise synthesizes a random phrase from the filler list.

---

# Section 14 — Evaluation (adversarial)

`evaluateFullInterview()` consumes full `history`, `resume`, accumulated `weaknesses`, `reasoningSignals`; aggregates reasoning; may emit **failure_surface**, **hire_recommendation**, **per_question_scores**, and maps to `Interview.totalScore`, `badgeLevel`, `scoreBreakdown` per §14.3–14.4.

**Badge thresholds:** Elite ≥ 90 · Gold ≥ 75 · Silver ≥ 60 · else Not Verified.

**Model tiers (spec):** Flash for agents; **Pro** for final full-interview evaluation — see §16 for exact model IDs in code.

---

# Section 15 — Route migration

- v1: `POST /api/interview/start`, `POST /api/interview/respond` — keep for old in-flight sessions.
- v2: `v2/start`, `v2/turn`, `v2/partial` — **ExpertInterviewStage** uses v2 for new sessions.
- Deprecation: after coexistence window, confirm no legacy in-progress interviews; retire v1 handlers.

---

# Section 16 — Repository implementation status (April 2026)

This section is the **engineering** view of §§11–15 above. Update when shipping.

| Area | Spec reference | Status |
|------|----------------|--------|
| Adversarial orchestrator + agents | §11 | **Shipped** — `server/src/services/interview/orchestrator.ts`, `agents.ts` |
| Parallel agents per turn | §11.4 | **Shipped** |
| Prefetch cache on partials | §11.6 | **Shipped** — `handlePartialTranscript`, in-memory cache; **`v2/turn`** also fires it on the **full** transcript (Whisper path) for warmup |
| Sprint openers / 15-question flow | §11.2, §11.8 | **Shipped** — `SPRINT_OPENERS`, `MAX_QUESTIONS`, `QUESTIONS_PER_SPRINT` |
| 30-minute hard stop | §11.8 | **Shipped** — `MAX_INTERVIEW_MINUTES` + `isInterviewComplete()` in `processTurn` |
| Interviewer utterance sanitization | §12.8 | **Shipped** — `sanitizeAiInterviewQuestionText()` + stricter agent prompts |
| STT echo / tail mitigation | §12.8 | **Shipped** — post-TTS mic cooldown + `scrubSttEcho` in `ExpertInterviewStage.tsx` |
| Turn ID stale response discard | §12.5, §13.2 | **Shipped** — client sends `turnId` (UUID); server echoes `turnId`; UI drops mismatched responses **and** re-checks after acknowledgement TTS, post-gap, and before main question TTS |
| Floor + TTS abort | §12.2 | **Shipped** — `AbortController` in `ExpertInterviewStage` + `useWhisperSession` discard while AI speaks |
| Primary STT (Expert Interview UI) | §12.1 | **Shipped** — OpenAI Whisper via **`useWhisperSession`** + **`POST /api/interview/transcribe`** (segmented upload); segment latency passed as **`whisperLatencyMs`** on **`v2/turn`** for server **`turnLog`** |
| Deepgram **nova-3** / live WS STT | §12.1 | **Alternate path** — **`useDeepgramSession.ts`** + **`/api/interview/deepgram-token`**; not wired into **`ExpertInterviewStage`** today |
| Cartesia TTS primary | §12.3 | **Shipped** — **`server/src/services/tts.service.ts`** (Cartesia → ElevenLabs); routes stream in `interview.ts` |
| TTS fallback shape | §13.5 | **Shipped** — `200` + `{ fallback: true }` + browser TTS (differs from spec `503`) |
| Filler TTS pre-cached at startup | §12.4 | **Shipped** — `warmInterviewFillerCache()` in server bootstrap; **`GET /api/interview/tts-filler`** |
| `deepgram-token` JWT | §13.4 | **Shipped** |
| v2 `/start`, `/turn`, `/partial` | §13 | **Shipped** |
| Gemini tiers in code | §14.5 | **Shipped** — `gemini-2.0-flash` (fast), `gemini-2.5-flash` (balanced), `gemini-2.5-pro` (deep) in `agents.ts` |
| Multi-pass final evaluation (3×) | §14 | **Shipped** — `evaluateFullInterviewMultiPass` in `evaluationService.ts`; `Interview.evaluationPassCount`, `evaluationScoreVariance` |
| v2 integrity merge (proctoring + anti-gaming) | §11 / integrity | **Shipped** — `orchestrator.ts` completion: same flag merge as v1 path; `integrityFlag`, `riskScore` |
| `turnLog` timing instrumentation | §11 / ops | **Shipped** — `whisperLatencyMs`, `agentPipelineMs`, `questionGenerationMs`, `totalTurnLatencyMs`, plus paste / snapshot fields |
| `InterviewQuestionResult` on v2 completion | §9 | **Shipped** — from `per_question_scores` in orchestrator finalize |
| 30-minute cap + `timeExpired` in API + UI | §11.8 | **Shipped** — `isInterviewComplete()` + `ExpertInterviewStage` banner |
| Candidate `POST /api/interview/:id/request-review` | Product | **Shipped** — 7-day gate, 10–500 char reason, 409 on duplicate; UI on results |
| Admin question analytics | Product | **Shipped** — `GET /api/admin/questions/analytics` (bank join, discrimination flags) |
| Admin session replay | Product | **Shipped** — `GET /api/admin/interviews/:id/replay` + `InterviewReplayView.tsx` |
| Pro Upgrade §§1–10 items | §9 checklist | Mixed — see `docs/PRD.md` §3.4 and task rows §9 |
| Silence nudge after 5s | §12.2 | **Shipped** — timer + short TTS while `user_speaking` in `ExpertInterviewStage` |

**Next engineering deltas (priority):** (1) Optional Deepgram **nova-3** in **`ExpertInterviewStage`** if product standardizes on live streaming STT, (2) optional strict **`503`** from TTS when all providers fail (vs current browser fallback contract), (3) continue Pro Upgrade checklist (§9) as needed.

---

# Appendix A — Baseline / legacy (v1)

*Verify in code before relying on line detail.*

- **Legacy plan:** Static / DB question bank via `QUESTION_BANK_SOURCE`, `POST /api/interview/start` + `respond` — still in `server/src/routes/interview.ts`.
- **Primary learner path:** **v2 adversarial** + `ExpertInterviewStage.tsx` + voice hooks.
- **Evaluator (v1 path):** `evaluateInterview()` aggregate JSON in `ai.service.ts`.
- **Scorecard:** `buildTechnicalScorecard()` — `aptitude*0.25 + dsa*0.35 + ai_interview*0.40` (0–100 arms); see **`docs/PRD.md (§11)`**.

Sections **1–15** are the target product spec; **§16** tracks repository drift.

---

## Document history

| Version | Change |
|---------|--------|
| 1.0 | Baseline-only PRD |
| 2.0 | Pro Upgrade (question bank, per-Q scoring, fallback, calibration, voice, proctoring, explainability, anti-gaming, checklist) |
| 2.1 | Appendix A: scorecard / aptitude clarity |
| 3.0 | Sections **11–15**: adversarial engine, voice (Deepgram + Cartesia), v2 APIs, evaluation, migration; **§16** codebase status; header aligns with product board |
| 3.0.1 | **§16** + §13.4/13.5 **implementation notes** (JWT token shape, ElevenLabs-only TTS until Cartesia) |
| 3.0.2 | **§12.8** production voice UX (sanitization, STT echo); **§16** refreshed (30m cap, turnId, Cartesia, filler warm, Whisper primary STT); header STT note; §13.5–13.6 aligned with **`tts.service.ts`** |
| 3.0.3 | **§16** — multi-pass eval, v2 integrity merge, turn timing / `whisperLatencyMs`, v2 per-question rows, `timeExpired`, silence nudge, review-request route + UI, admin analytics & replay; cross-ref **`PRD.md` (Part D) Part A v1.3** |

*PRD v3.0.3 — April 2026 | ProvenHire Product Team*
