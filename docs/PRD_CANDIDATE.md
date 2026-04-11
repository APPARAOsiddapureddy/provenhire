# ProvenHire — Candidate platform PRD

**Version:** 6.9  
**Last Updated:** April 2026  
**Status:** Current  

This file is **Part A — Candidate platform**: verification (all tracks), scoring, routes, and the expert interviewer module.  

**Other parts:** **[PRD.md](PRD.md)** (index) · **[PRD_RECRUITER.md](PRD_RECRUITER.md)** · **[PRD_BUSINESS.md](PRD_BUSINESS.md)** · **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)** (full AI adversarial spec).

**Implementation drift log:** [IMPLEMENTATION_CHANGELOG.md](IMPLEMENTATION_CHANGELOG.md)

---

## Table of contents

| Section | Content |
|---------|---------|
| §§1–2 | Executive summary, user roles |
| §3 | Verification flow (pipeline v2, all tracks), AI interview summary |
| §§4–15 | Expert interviewer (human), routes, scoring detail, tech stack, security, future |

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

> **⚠️ Pipeline v2 is active** (`VERIFICATION_PIPELINE_V2=true` in production).  
> The **legacy** five-stage path (`aptitude_test` → `dsa_round` → AI Expert → Human Expert, without AI Skills / CS fundamentals) is **kept below for reference only** (e.g. env unset or migration edge cases).  
> **All new development targets pipeline v2.** Do **not** add product features to the legacy path only.

#### Verification stages — implementation status (by track)

| Stage | Software track | Data track | Non-technical |
|-------|----------------|------------|---------------|
| **Fundamentals (fresher)** | `cs_fundamentals` ✅ | `data_fundamentals` ✅ | `domain_fundamentals` ✅ — **15** role-specific MCQs, **20 minutes**, **no** combined aptitude |
| **Code / task round** | `dsa_round` ✅ | `data_round` ✅ | — |
| **AI Skills Interview** | `ai_skills_interview` ✅ | `data_skills_interview` ✅ | — |
| **Role assignment** | — | — | `non_tech_assignment` ✅ — **PDF/DOCX** upload, **48-hour** window from first prompt fetch, **no** proctoring, **no** fullscreen |
| **System design** | `system_design_interview` ❌ **placeholder UI** (no full software session shipped) | `data_system_design` ✅ | — |
| **AI Expert Interview** | `expert_interview` ✅ | `expert_interview` ✅ (data-calibrated) | `expert_interview` ✅ |

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

**Engineering notes (v2 wiring):** Interview types, DSA/Data round tiers, certification levels, paid retakes/cooldowns, and recruiter limits are implemented per **[PRD_BUSINESS.md](PRD_BUSINESS.md)** and `IMPLEMENTATION_CHANGELOG.md`. **`system_design_interview`** (software mid/senior) may still use **`PipelineStagePlaceholder`** in **`VerificationFlow.tsx`** until a software system-design session ships; **`data_system_design`** uses the real flow above.

**Candidate monetization (retakes / cooldowns)** is defined in **[PRD_BUSINESS.md](PRD_BUSINESS.md)** and enforced server-side for paid stages and CS/DSA timing.

### 3.1 Technical Track — Legacy numbering (5 Stages)

The table below describes the **classic** five-step narrative still used in much of the UX copy; map stage **names** to your active pipeline via §3.0.

| Stage | Name | Description | Pass Criteria |
|-------|------|-------------|---------------|
| 1 | Profile Setup | Resume upload, AI analysis, profile completion | Profile saved |
| 2 | Aptitude Test | 20 MCQs (verbal + quant/logical), **30-minute** timed test; server enforces window from session start | **≥ 60%** of weighted marks to pass; UI shows **percentage** (e.g. 72%); raw marks stored in `AptitudeTestResult`, **0–100** in stage/skill rows — see `§11` (below) |
| 3 | DSA Round | Coding challenges, problem-solving | Score recorded |
| 4 | AI Expert Interview | Structured AI-led technical interview | Score recorded |
| 5 | Human Expert Interview | Live video interview with expert interviewer | Pass ≥70% |

> **SCORECARD FORMULA (canonical — technical shortlist to human expert)**  
> **`final_score = aptitude × 0.25 + dsa × 0.35 + ai_interview × 0.40`** (each arm **0–100**).  
> **Shortlist gate:** **`final_score ≥ 65`**.  
> **Per-stage floors:** aptitude **≥ 55**, DSA **≥ 60**, AI interview **≥ 60**.  
> **Source of truth:** `buildTechnicalScorecard()` in `server/src/services/verificationScoring.service.ts`.

**Shortlisting (Stage 4 → 5):** Uses the formula and gates in the box above. Further aptitude/DSA/AI scoring detail is in **§11** (below).

### 3.2 Non-Technical Track (pipeline v2)

| Stage | `stage_name` (typical) |
|-------|-------------------------|
| 1 | Profile Setup (`profile_setup`) |
| 2 | **Fresher only — Domain Fundamentals:** **15** role-specific MCQs **only** (no aptitude), **20 minutes** (`domain_fundamentals`) |
| 3 | **Role Assignment:** document upload (**PDF/DOCX**), **48-hour** window from first prompt fetch, **no** proctoring, **no** fullscreen (`non_tech_assignment`) |
| 4 | AI Expert Interview (`expert_interview`) |

**Mid/senior** paths omit **`domain_fundamentals`** (assignment directly after profile). **L1/L2/L3** and retake rules follow non-technical sections and `verificationScoring.service.ts`.

**Planned (not yet implemented):** The **AI Expert Interview** for the non-technical track will use the **submitted assignment document** as additional context for questions and evaluation (orchestrator / resume context injection — follow `NonTechAssignment` + `expert_interview` integration work).

No mandatory **Human Expert Interview** stage on the default non-technical pipeline (optional product lane elsewhere).

### 3.3 Verification Status

- `pending` — In progress
- `verified` — All stages passed (technical: through Stage 4 or 5)
- `expert_verified` — Passed Stage 5 human expert interview

### 3.4 AI Expert Interview (Stage 4) — Specification & implementation status

This section summarizes what the AI interview does in-product. The **full specification** (Pro Upgrade §§1–10, adversarial engine §11, voice §12, v2 APIs §13–15, **§16** codebase status) lives in **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)**.

#### 3.4.1 Purpose and learner promise

- **Goal:** A structured interview that feeds the verification scorecard (**40%** of the technical blend with Stages 2–3 where that blend applies; see §3.1 and `buildTechnicalScorecard()`). **Technical** and **data** tracks default to **voice-first**; **non-technical** defaults to **typed** answers with an optional voice toggle in UI (`ExpertInterviewStage`).
- **Format (live product):** **Adversarial v2** — **three sprints** and up to **15** total exchanges. **Sprint names and openers** depend on **`JobSeekerProfile.roleType`**: software uses **Project Defense → Foundations → System Design**; **non-technical** uses **Experience Defense → Domain Foundations → Scenario**; **data** uses **Data Project Defense → Data Foundations → Data Systems & Scale** (see `orchestrator.ts`). Dynamic follow-ups (weakness / discrepancy / reasoning probes) are driven by **Gemini** agents (`agents.ts`).
- **Pre-start context (Expert Interview UI):** `VerificationFlow` passes **`verificationRoleType`** (from profile `roleType`) and **`experienceYears`**. If the candidate is **non-technical**, **data**, **or** has a **non-empty `targetJobTitle`**, the screen **skips** the software-only role dropdown and shows a **read-only** role + experience summary. **`POST /api/interview/v2/start`** receives **`jobRole`** from the profile title (not a forced **Software Engineer** default) and **`experienceLevel`** derived from years (**&lt;2** junior, **2–5** mid, **5+** senior). This keeps questions and scoring aligned with the **actual target role** (e.g. marketing vs engineering).
- **Trust:** Camera and tab/proctoring signals are required during the session; outcomes can be flagged for admin review when integrity or anti-gaming rules fire.

**AI Skills Interview — Part A (DSA / Data walkthrough):** The orchestrator loads the candidate’s **exact** submitted work: **code or query text**, **problem/task title**, **difficulty**, and **test-case results** per item (`aiSkillsOrchestrator.ts`, `loadDSAContext` / `loadDataRoundContext`). Questions are generated **about those submissions** — not generic textbook DSA. **Fully solved** items: probes on approach, complexity, optimization, edge cases. **Partially solved** items: where the solution broke down, what the candidate tried, what they would change next. **Not solved / failed:** debugging mindset and next steps. **Question counts** across Part A are **distributed proportionally** (`distributeQuestions`) with **extra weight on partially solved** problems (more surface area to explore). The model is instructed **not** to ask unrelated abstract algorithm questions when submission context exists.

#### 3.4.2 Interview engines in the codebase

| Track | Entry | Behavior |
|-------|--------|----------|
| **Primary (verification UI)** | `POST /api/interview/v2/start`, `POST /api/interview/v2/turn`, `POST /api/interview/v2/partial` | Orchestrator in `server/src/services/interview/orchestrator.ts`: sprint personas, static openers per sprint, `processTurn` / agents for follow-ups and final evaluation. **Non-technical:** alternate sprint names/openers + **`generateSprintQuestion(nonTechnical, subtrack)`** + weighted dimension scoring. **Data (`roleType === "data"`):** data sprint names/openers + **`dataTrack` / `dataSubtrack`** in agents. Front end: `src/pages/verification/stages/ExpertInterviewStage.tsx` — **`verificationRoleType`** and **`experienceYears`** wired from **`VerificationFlow.tsx`** (v6.9). |
| **AI Skills (software / data)** | `POST /api/interview/ai-skills/start`, `POST /api/interview/ai-skills/turn`, `GET /api/interview/ai-skills/status` | `aiSkillsOrchestrator.ts`; data track uses Data Round context and data-skills Part B. Verification stages: `ai_skills_interview` vs `data_skills_interview`. |
| **Data System Design** | `POST /api/interview/data-system-design/start`, `POST .../turn`, `GET .../status` | `systemDesignOrchestrator.ts`; `interviewType: system_design`; verification stage `data_system_design` only (data track). |
| **Legacy / question-plan** | `POST /api/interview/start`, `POST /api/interview/respond`, etc. | Older linear plan with optional **`QUESTION_BANK_SOURCE=db`** (`InterviewQuestionBank`). Still present for compatibility; the verification flow uses **v2** for the AI Expert Interview stage. |

#### 3.4.3 Voice, TTS, STT, and environment

| Capability | Implemented | Notes |
|------------|-------------|--------|
| **Speech-to-text (AI Expert + AI Skills verification UIs)** | Yes | **Primary path:** **`useWhisperSession`** (`src/hooks/useWhisperSession.ts`) — browser **MediaRecorder** + **RMS-based VAD** (~**1.5s** silence ends a segment), then **`POST /api/interview/transcribe`** → **OpenAI Whisper** `whisper-1` (`server/src/services/whisper.service.ts`), English, verbose JSON → transcript + coarse **high / medium / low** confidence. Used by **`ExpertInterviewStage.tsx`** and **`AISkillsInterviewStage.tsx`**. Client sends **`whisperLatencyMs`** on turn endpoints for **`turnLog`**. **Product relevance:** segmented post-hoc transcription favors **accurate final text** for Gemini weakness/discrepancy agents over ultra-low-latency streaming partials alone. |
| **Speech-to-text (live alternate; not mounted on Expert / AI Skills)** | Optional | **`useDeepgramSession.ts`** + **`GET /api/interview/deepgram-token`** + **`POST /api/interview/v2/partial`** for prefetch / future live UX — **not** imported by Expert or AI Skills stages today. |
| **Text-to-speech (questions, acks, nudges)** | Yes | **`server/src/services/tts.service.ts`**: **Cartesia** (`sonic-english`, MP3 stream) when **`CARTESIA_API_KEY`** and **`CARTESIA_VOICE_ID`** are set; else **ElevenLabs** (`eleven_turbo_v2_5`); else JSON **`{ fallback: true, text }`** for client **`speechSynthesis`**. Routes: **`POST /api/interview/tts`**, **`GET /api/interview/tts-filler`**. **Fillers:** **`warmInterviewFillerCache()`** at server start + **`getPreCachedFillerMp3`** when available. **Product relevance:** natural voice improves **question comprehension**; fillers mask **Gemini** latency. **Client:** ~**520ms** cooldown after TTS before re-enabling mic (**`POST_AI_SPEECH_COOLDOWN_MS`**) so Whisper does not transcribe **TTS** as the candidate. |
| **5s review / edit transcript before send** | No | Spec’d in Part D §5 for a typed+voice hybrid; v2 Expert path is **submit when ready** (draft + optional multi-segment voice) without a mandatory review gate. |
| **Typed answer mode** | Yes (Expert) | **`ExpertInterviewStage`:** **`verificationRoleType`** from **`VerificationFlow`** — **non-technical** defaults **`inputMode: typed`**; **technical** / **data** default **voice**, with UI toggle. **`POST /api/interview/v2/turn`** accepts **`inputMode: "voice" \| "typed"`**. |

**Production checklist (operator):** **`GEMINI_API_KEY`** (interview intelligence); **`OPENAI_API_KEY`** (Whisper **`/transcribe`** for Expert + AI Skills voice); **`CARTESIA_*`** (primary TTS) and/or **`ELEVENLABS_*`** (fallback TTS); optional **`DEEPGRAM_API_KEY`** only if product wires live Deepgram on a surface.

#### 3.4.4 Proctoring, anti-gaming, and integrity

| Area | Status | Implementation pointers |
|------|--------|-------------------------|
| Tab switch, fullscreen, copy/paste, devtools (feature flags) | Live | `useProctoringRiskMonitor` in `ExpertInterviewStage`; events logged per session. |
| Face / phone hints | Live | `useFaceAndPhoneDetection` with optional server `STOP_TEST` when strict. |
| Session labels (baseline / elevated / high attention) | Live | Driven by logged violation counts, not a single “risk score” as the learner-facing number. |
| Anti-gaming scoring | Partial / live | `analyzeAnswerAntiGaming` and merge into `integrityFlag` / interview outcome (see `interview.ts` + services). |
| Admin override + `ProctoringReviewLog` | Per extended PRD | Model/checklist in **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)**; confirm admin UI coverage separately. |
| **`pending_review`** when Gemini eval fails | Partial | Canonical fallback and admin re-eval are spec’d in **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)** §3; wire-up should be verified per release. |

#### 3.4.5 Scoring, shortlist, and what the candidate sees

- **Per-session score:** v2 completion returns `totalScore`, `badgeLevel`, and structured **`evaluation`** (verdict, strengths, weaknesses) consistent with `evaluateFullInterview` / aggregates.
- **Shortlist gate:** Stage 4 contributes **0–100** into the technical scorecard; combined blend and floors (e.g. AI interview **≥ 60**) — §3.1.
- **Candidate explainability:** Completion UI shows badge, score, verdict, strengths, and improvement bullets — aligned with §7 of the extended PRD where implemented; **per-question breakdown** remains admin-only per spec.

#### 3.4.6 API surface (AI interview, v2 + media)

| Method | Path | Role |
|--------|------|------|
| POST | `/api/interview/v2/start` | Create session + first sprint question (auth, job seeker). |
| POST | `/api/interview/v2/turn` | Submit answer text (`inputMode: voice` \| `typed`), optional **`whisperLatencyMs`**, **`turnId`**, paste/time telemetry; receive next question or completion. |
| POST | `/api/interview/v2/partial` | Optional prefetch while user is still speaking (used with Deepgram/live paths when wired). |
| GET | `/api/interview/deepgram-token` | Returns `{ token }` or `{ token: null }` for browser live STT (alternate path). |
| POST | `/api/interview/transcribe` | Multipart **audio** → **OpenAI Whisper** transcript (+ confidence); used by **`useWhisperSession`** on Expert + AI Skills stages. |
| POST | `/api/interview/tts` | MP3 stream (**Cartesia** or **ElevenLabs**) or JSON `{ fallback: true, text }` for browser TTS. |
| GET | `/api/interview/tts-filler` | Short filler line while model thinks (precached MP3 when warmed). |
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
| Non-technical Expert calibration (sprints, `generateSprintQuestion(nonTechnical, subtrack)`, eval meta) | Done |
| Data-track Expert calibration (`dataTrack` + `dataSubtrack` in `generateSprintQuestion` / `evaluateFullInterview`) | **Done** — `orchestrator.ts` passes `dataSubtrack`; `agents.ts` applies **`DATA_SUBTRACK_CAL[dataSubtrack]`** in sprint-question and evaluation prompts (verify after each agents change) |
| Data System Design session (data track) | Done — see §3.0.1 |
| Software System Design stage (`system_design_interview`) | Partial — UI may remain placeholder until software session ships |
| Role + experience on start (Expert) | Done — **v6.9:** profile-driven **`jobRole`** / derived **`experienceLevel`** when non-tech, data, or profile has **`targetJobTitle`**; otherwise software role dropdown (`ExpertInterviewStage` + `VerificationFlow`). |
| Cloud STT/TTS + browser fallbacks | **STT:** **OpenAI Whisper** (segmented) is **primary** on Expert + AI Skills UIs; **Deepgram** live is optional and **not** wired to those stages. **TTS:** **Cartesia** → **ElevenLabs** → browser (`tts.service.ts`). Part D §16 “Deepgram nova-2/3 on Expert” is **not** current for verification Expert UI — see §3.4.9. |
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

Detailed task checklist and data model notes remain in **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)** (especially Part B §16).

#### 3.4.9 AI interviews — questions asked, relevance, STT/TTS, and answer process

**Scope:** Verification surfaces that use **in-browser voice + server intelligence** together: **AI Expert Interview** (`ExpertInterviewStage`, **v2** adversarial) and **AI Skills Interview** (`AISkillsInterviewStage`). **Data System Design** is primarily **typed** with optional TTS on questions — see §3.0.1. Legacy **`POST /api/interview/start`** + **`respond`** question plans are separate (§3.4.2).

##### What questions are asked (structure and sources)

1. **AI Expert (v2)** — `server/src/services/interview/orchestrator.ts`, `agents.ts`, **`startAdversarialInterview`** / **`processTurn`**:
   - **Three sprints**, each with a **persona** (`curious_lead`, `socratic_mentor`, `senior_peer`) and a **track-specific static opener** (`SPRINT_OPENERS`, `NON_TECH_OPENERS`, or `DATA_OPENERS`).
   - **Technical:** Project Defense → Foundations → System Design scenarios.
   - **Non-technical:** Experience Defense → Domain Foundations → stakeholder/scenario sprint.
   - **Data:** Data project → technical depth → data systems at scale.
   - **Up to 15** scored question turns (**5 per sprint**), **30-minute** wall-clock cap, and completion rules in **`isInterviewComplete`**.
   - **After each answer**, parallel **Gemini** calls: **`detectWeakness`**, **`checkDiscrepancy`** (resume vs answer), **`evaluateReasoning`**, **`extractConcepts`**; then **`applyReasoningHonestyCap`**. The **next question** is chosen by the **priority chain** (Part D §4): high-severity **discrepancy** probe (new **`resumeClaim`**) → high-severity **weakness** probe → **question-bank deepen** via **`adaptFollowup`** → **prefetch** if **`isStillRelevant`** → else **`generateSprintQuestion`** with **`nonTechnical` / `subtrack` / `dataTrack` / `dataSubtrack`**. On sprint boundary, the next **opener** is injected and **`findFollowupsForQuestionText`** loads templates for that line.
   - **Resume context** — **`buildResumeContext`**: target title, years, skills, work JSON, **`nonTechSubtrack`** or **`dataSubtrack`** from title detection — keeps LLM prompts **aligned to the candidate’s stated role**.

2. **AI Skills** — `aiSkillsOrchestrator.ts`; APIs **`/api/interview/ai-skills/*`**. Part A grounded in **DSA submission** (software) or **Data Round** (data); Part B deepens skills. Same **Whisper + TTS** client stack as Expert (§3.4.3).

##### How relevance is preserved (questions stay on-topic and non-repetitive)

| Mechanism | Role |
|-----------|------|
| **`isStillRelevant`** | Prefetch candidate must overlap **extracted concepts** or substantive words with the user’s answer — avoids irrelevant prefetched lines. |
| **`isNearDuplicateQuestion`** | Drops prefetches too similar to **recent asked** questions. |
| **`resolveDistinctQuestion`** | Regenerates if the model would duplicate a prior prompt. |
| **`probedClaims`** | Avoids repeating the same **resume discrepancy** probe. |
| **Consecutive high same-type weakness** | **`forceSprintQuestion`** + **`pivoting`** — escapes interrogation loops. |
| **`findFollowupsForQuestionText`** | Deepening templates tied to the **actual** question string. |
| **Fragment handling** | Very short answers: **`fragmentRetry`** without advancing the adversarial pipeline unfairly. |
| **Subtracks** | **`detectNonTechSubtrack`** / **`detectDataSubtrack`** — narrows marketing vs HR vs analytics-style calibration passed into **`generateSprintQuestion`** / evaluation meta. |

##### Text-to-speech — stack and product relevance

| Layer | Implementation | Relevance |
|-------|----------------|-----------|
| **Server synthesis** | **Cartesia** primary, **ElevenLabs** second, else instruct client to **`speechSynthesis`** | Candidates **hear** adversarial questions clearly; reduces mis-scores from “couldn’t parse audio” |
| **Fillers + cache** | **`tts-filler`** + **`warmInterviewFillerCache`** | Masks **Gemini** latency; feels continuous |
| **Client timing** | Cooldown after TTS before mic; **sequential** ack → gap → main question | Prevents **STT pollution** from speaker audio; avoids stale **`turnId`** races |

##### Speech-to-text — stack and product relevance

| Layer | Implementation | Relevance |
|-------|----------------|-----------|
| **Segmented capture** | **VAD** ~1.5s silence, **WebM/Opus** blob, **Whisper** `whisper-1` | **High-fidelity** text for **weakness** and **discrepancy** agents |
| **Telemetry** | **`whisperLatencyMs`** on **`v2/turn`** | **turnLog** / ops visibility |
| **vs live streaming** | **Deepgram** not used on these stages today | Trade-off: **latency vs accuracy** — product chose **accuracy** for verification |

##### End-to-end: answering one turn (AI Expert v2)

1. **Start:** User gesture → optional **fullscreen** → **`getUserMedia`**. **`POST /api/interview/v2/start`** with **`jobRole`** and **`experienceLevel`** (from **profile** when UI skips pickers — §3.4.1). Server creates row, returns first **question** + sprint meta.
2. **Listen to AI:** **`POST /api/interview/tts`** (or browser fallback); Whisper **paused** during AI floor.
3. **Voice answer:** **`user_speaking`** floor; segments transcribed → draft; user **Submit** when ready (multi-segment answers concatenate). Optional **silence nudge** TTS if idle.
4. **Typed answer:** **`inputMode: typed`**; compose in **textarea**, Submit (no **`whisperLatencyMs`** for that turn).
5. **Turn:** **`POST /api/interview/v2/turn`** with **answer**, **`inputMode`**, **`turnId`**, optional telemetry. Server **`processTurn`**, persists **`InterviewMessage`**, returns **acknowledgement** + **response** (next question) or completion / **`fragmentRetry`** / **`timeExpired`** / **`pivoting`**.
6. **Audio chain:** Play acknowledgement TTS, short gap, play question TTS; **abort** if **`turnId`** stale.
7. **Completion:** Multi-pass **`evaluateFullInterview`**, badge/score UI, human-gate **`pending_review`** where applicable, optional **request-review**.

**AI Skills:** Same **Whisper + TTS** pattern; submits to **`/api/interview/ai-skills/turn`** instead of **`v2/turn`**.

---

## 4. Expert Interviewer Module

### 4.1 Careers Page (`/careers/interviewer`)

**Purpose:** Recruitment of interviewers who will conduct Stage 5 human expert interviews.

**Compensation & economics (founding vs standard, recruiter add-on pricing):** **[PRD_BUSINESS.md](PRD_BUSINESS.md)** §4. Marketing copy should match locked rates (e.g. founding **₹750** / session).

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
  score: 0–100 on stage rows; raw aptitude marks on AptitudeTestResult; see **§11** in this file

JobSeekerProfile (verificationStatus, roleType, subtracks)
  verificationStatus: pending | verified | expert_verified
  roleType: technical | non_technical | data  (legacy **technical** = software path; **data** = data track)
  nonTechSubtrack, dataSubtrack: optional strings set when profile_setup completes (title-derived; see `verificationPipeline.ts`)
```

### 6.4 Proctoring & integrity signals

- **Violation counts (source of truth):** Each integrity signal type (tab switch, fullscreen exit, face issues, etc.) is tracked by **how many times** it was logged for the session (after server-side / client rate limits), not by a cumulative weighted “risk score.”
- **Persistence:** `ProctoringEvent.riskScore` stores the **1-based violation index for that signal type** in that session at log time. Full snapshots can live in `details` / `violationDetails`.
- **Interview row:** `Interview.riskScore` stores the **number of proctoring alert rows** for that AI interview session (for sorting/visibility). `integrityFlag` still captures review tiers; see **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)** §6.
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

*Use this document together with **[PRD.md](PRD.md)** (index) and **§2** (User Roles) above. Implementation references: `server/src/routes/verification.ts` (aptitude), `server/src/data/aptitude-loader.ts`, `server/src/data/aptitude-session-db.ts`, `server/src/utils/aptitudeScore.ts`, `src/pages/verification/stages/AptitudeTestStage.tsx`.*

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

Expert interviewers conduct **human** expert interviews (verification stage `human_expert_interview` in legacy chain; eligibility and certification may vary when **`VERIFICATION_PIPELINE_V2`** is on — see **§3.0** above). They set availability, view candidate context, submit weighted evaluations (≥70 = pass / L3), and accrue per-session earnings. **Recruiter-paid human sessions** (₹2,500) are a separate product lane from candidate verification cost — see **[PRD_BUSINESS.md](PRD_BUSINESS.md)**. This file tracks **what the codebase implements** for the interviewer role.

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
- Automated payouts and in-app payment (Razorpay) — see **[PRD_BUSINESS.md](PRD_BUSINESS.md)** (parked items in backlog)
- Non-technical track Stage 5 (human expert) if needed
