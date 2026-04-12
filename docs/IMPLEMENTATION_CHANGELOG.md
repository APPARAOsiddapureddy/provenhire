# ProvenHire — Implementation changelog

**Purpose:** Summarize **code and product-facing UI** changes so engineers and PMs can align without reading full diffs. For **business rules and backlog**, see [PRD_BUSINESS.md](PRD_BUSINESS.md) and the index in [PRD.md](PRD.md) / [README.md](README.md).

---

## April 2026

### Employer next-interview routing + system design UX + shared TTS (code + PRD)

| Change | Location |
|--------|----------|
| **Recruiter path after AI Expert** — **`PATCH .../next-interview`**; **`JobApplication.recruiterNextInterviewMode`** (+ timestamps, setter); **`human_expert`** → **`approveAdminReviewQueueForHumanExpert`**; other modes → queue **`recruiter_redirected`**. | `server/src/services/recruiterInterviewPath.service.ts`, `server/src/services/humanInterviewGate.service.ts`, `server/src/routes/jobs.ts`, migration **`20260413120000_job_application_recruiter_interview_path`** |
| **Verification** — AI Expert completion sets **`expert_interview`** **`completed`**; admin queue for Human Expert routing. | `humanInterviewGate.service.ts` |
| **Dashboard UI** — **`ApplicantsPage`** next-step selector; **`JobSeekerDashboard`** Human Expert messaging. | `src/pages/dashboard/ApplicantsPage.tsx`, `JobSeekerDashboard.tsx` |
| **System design** — camera gate, proctoring (**`system_design`** / **`data_system_design`**), shared **`interviewTts`** (MP3 + JSON browser fallback). | `SystemDesignInterviewStage.tsx`, `DataSystemDesignStage.tsx`, `src/lib/interviewTts.ts`, `server/src/routes/proctoring.ts`, `useProctoringRiskMonitor.ts` |
| **Expert + AI Skills TTS** — deduped via **`interviewTts`**. | `ExpertInterviewStage.tsx`, `AISkillsInterviewStage.tsx` |
| **Docs** — **`PRD.md`**, **`PRD_CANDIDATE.md`**, **`PRD_AI_INTERVIEW.md`**, **`PRD_RECRUITER.md`** §7.6, **`PRD_BUSINESS.md`** (Human Expert gating). | `docs/` |

### PRD v6.9 — split PRD + non-tech §3.2 + deployment env (documentation)

| Change | Location |
|--------|----------|
| **PRD split:** **`PRD.md`** = index only; specs in **`PRD_CANDIDATE.md`**, **`PRD_RECRUITER.md`**, **`PRD_BUSINESS.md`**, **`PRD_AI_INTERVIEW.md`**. | `docs/` |
| **Candidate PRD:** §3.0 pipeline v2 callout + **implementation status table** (software vs data vs non-tech); §3.2 non-tech **15 MCQ / assignment upload / 48h**; §3.1 **canonical scorecard** box; AI Skills Part A (submission-grounded questions); §3.4.7 data Expert calibration row; removed **§10 test credentials** from PRD (moved to ops doc). | `docs/PRD_CANDIDATE.md` |
| **Deployment:** extra env vars (Whisper, Cartesia, ElevenLabs, bank encryption, cron); **after deploy** migrations note; **production readiness** checklist. | `docs/DEPLOYMENT_COMPLETE.md` |
| **Cross-links:** root `README.md`, `DOCUMENTATION.md`, `docs/README.md`, `SKILL_VALIDITY_SETUP.md`. | repo |

### PRD v6.8 — AI interviews (documentation + Expert profile context)

| Change | Location |
|--------|----------|
| **PRD v6.8 (content now in split files):** [PRD_CANDIDATE.md](PRD_CANDIDATE.md) **§3.4.1** (track-specific sprints, voice vs typed, **profile-driven `v2/start`**). **§3.4.3** — Whisper STT + Cartesia/ElevenLabs TTS. **§3.4.6–§3.4.9**, etc. [PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md) Part D deltas (§5–§6, §12.0, §11.6, §16, history **3.0.4**). |
| **Expert Interview UI** — `verificationRoleType` + `experienceYears` from **`VerificationFlow`**; skip software role dropdown for non-tech / data / profile title; read-only summary. | [`VerificationFlow.tsx`](../src/pages/verification/VerificationFlow.tsx), [`ExpertInterviewStage.tsx`](../src/pages/verification/stages/ExpertInterviewStage.tsx) |

### Data track & system design (PRD v6.7 + code)

| Change | Location |
|--------|----------|
| **PRD v6.7 (content now in [PRD_CANDIDATE.md](PRD_CANDIDATE.md) / [PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)):** **§3.0.1 Data track**, **§3.2** non-technical, recruiter §6.3 data flow, etc. |
| **Data System Design** — orchestrator, **`/api/interview/data-system-design/*`**, UI stage, verification rules for **`data_system_design`**. | `server/src/services/interview/systemDesignOrchestrator.ts`, `server/src/routes/interview.ts`, `server/src/routes/verification.ts`, [`DataSystemDesignStage.tsx`](../src/pages/verification/stages/DataSystemDesignStage.tsx), [`VerificationFlow.tsx`](../src/pages/verification/VerificationFlow.tsx) |
| **AI Expert** data calibration (sprints, agents). | [`orchestrator.ts`](../server/src/services/interview/orchestrator.ts), [`agents.ts`](../server/src/services/interview/agents.ts) |
| **Profile subtracks** + migration **`20260409130000_jobseeker_subtrack_fields`**. | [`schema.prisma`](../server/prisma/schema.prisma), [`verification.ts`](../server/src/routes/verification.ts) |
| **Retake gate:** **`data_skills_interview`** uses AI Skills cooldown. | [`verificationStageRetakeGate.service.ts`](../server/src/services/verificationStageRetakeGate.service.ts) |
| **Dashboard** data track labels/order/chips; **Paywall** data stage names. | [`JobSeekerDashboard.tsx`](../src/pages/dashboard/JobSeekerDashboard.tsx), [`PaywallModal.tsx`](../src/components/PaywallModal.tsx) |

### Documentation

| Change | Location |
|--------|----------|
| **Earlier merge (superseded by v6.9):** separate recruiter/business/AI files were merged into one `PRD.md`; **v6.9** split again for navigation. **`DEPLOYMENT.md`** removed; use **`DEPLOYMENT_COMPLETE.md`**. | `docs/` |

### Brand (in-app)

| Change | Location |
|--------|----------|
| **Typographic wordmark only** — `Proven` + `Hire` text; **no** raster logo image in the site chrome (navbar / footer). | [`src/components/BrandMark.tsx`](../src/components/BrandMark.tsx), [`Footer.tsx`](../src/components/Footer.tsx), [`Navbar.tsx`](../src/components/Navbar.tsx) |
| Favicons, PWA, and social **OG images** may still be generated from **`public/logo.png`** — that asset is for browsers/meta, not the in-app header. | `public/`, `scripts/generate-favicons.js` |

### Job seeker — dashboard & auth

| Change | Location |
|--------|----------|
| Verification **step order** follows **`GET /api/verification/stages`** response field **`stage_order`** when present (matches server: legacy 5-step path vs `VERIFICATION_PIPELINE_V2` fresher/mid/senior). Falls back to a fixed legacy list if missing. | [`JobSeekerDashboard.tsx`](../src/pages/dashboard/JobSeekerDashboard.tsx) |
| Dashboard **copy** updated: progressive certification, early job access after L1, ProvenHire Resume, evidence-over-claims; L1–L3 card blurbs; human expert block and timing hint. | Same |
| **Stage labels & descriptions** for `cs_fundamentals`, `ai_skills_interview`, `system_design_interview`; shared chips for cognitive/CS fundamentals completion. | Same |
| **Skill Passport / My Resume** section intros aligned with portable proof and recruiter-facing resume. | Same |
| **Auth** marketing panels: tickers, stats, and subtitles emphasize progressive verification and first-attempt-free positioning (not rigid “5 stages only” framing). Technical track tiles say “Progressive path” instead of a fixed stage count. | [`Auth.tsx`](../src/pages/Auth.tsx) |

### Verification UI components

| Change | Location |
|--------|----------|
| **VerificationGateDialog** — title/body/bullets and **stage name map** include v2 stage ids (`cs_fundamentals`, `ai_skills_interview`, `system_design_interview`, etc.). | [`VerificationGateDialog.tsx`](../src/components/VerificationGateDialog.tsx) |
| **VerificationPipelineCard** — accepts **`technicalPipelineSteps`** (from dashboard, derived from `stage_order`, excluding `profile_setup` and `human_expert_interview`). Default remains cognitive → DSA → AI expert when no API order. **Cert path** row text matches L1/L2/L3 ideology. | [`VerificationPipelineCard.tsx`](../src/components/VerificationPipelineCard.tsx) |

### Verification flow stages (UI)

| Change | Location |
|--------|----------|
| **DSA** and **Expert interview** stage screens refined (copy/UX alignment with current flows). | [`DSARoundStage.tsx`](../src/pages/verification/stages/DSARoundStage.tsx), [`ExpertInterviewStage.tsx`](../src/pages/verification/stages/ExpertInterviewStage.tsx) |

### Backend — interview & verification routes

| Change | Location |
|--------|----------|
| Updates to **`server/src/routes/interview.ts`** and **`server/src/routes/verification.ts`** in this period (orchestration, gates, error payloads — align with AI interview and verification staging). **Exact behavior:** read route handlers and services referenced there; PRD 4 gates are documented under revenue/verification PRDs. | `server/src/routes/` |

### Revenue & pipeline (cross-reference)

The following landed in **migrations + services** around the same program; details are in PRDs, not duplicated here:

- Candidate **retake ledger**, cooldowns, **paid stage** gating, recruiter **subscription usage** (`RecruiterUsage`, contacts, profile views), admin **`grant-retake`** / **`recruiter plan`** PATCH.
- **`docs/PRD.md`** (v6.9+): **index**; verification v2 in **[PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3.0** and **data track §3.0.1**.

---

## How to update this file

After a meaningful release or sprint, append a dated section with tables like above (what / where). Keep **business numbers** in the revenue/business PRD; here, link to code paths and high-level behavior only.
