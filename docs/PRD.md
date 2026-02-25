# ProvenHire — Product Requirements Document (PRD)

**Version:** 4.1  
**Last updated:** February 2026  
**Status:** FINAL — Both Tracks Fully Specified | All Decisions Locked

---

## 0. PRD v4.1 Summary (Master Decision Log)

- **Two verification tracks:** **Technical** (5 stages: Profile → Aptitude → DSA → AI Interview → Human Expert Interview) and **Non-Technical** (2 stages: Profile → Role-Specific AI Interview; then per-job assignment).
- **4 roles:** Job Seeker, Recruiter, **Expert Interviewer** (separate login + dashboard), Admin. Recruiters have zero involvement in Stage 5.
- **Shortlisting (Tech):** Algorithm after Stage 4: Stage 2 (25%) + Stage 3 (35%) + Stage 4 (40%). Threshold ≥ 65%. Shortlisted candidates only get Stage 5. No badge for non-shortlisted.
- **3-attempt rule (Tech):** Each of Stage 2, 3, 4 has independent max 3 attempts; 2–3 day cooldown between failed attempts. Third failure at any stage = tech track locked → redirect to non-tech jobs.
- **Non-Tech:** Stage 2 = Role-Specific AI Interview (text-based, 10–15 min, 5–8 questions, 2 attempts max). After pass: "ProvenHire Non-Tech Verified" badge. Per-job assignment (LLM-generated, 48 hr deadline, anti-fraud follow-up, AI scoring).
- **Job gates:** Premium tech jobs = expert_verified only. Non-tech jobs = nontech_verified only. Enforced server-side.
- **Recruiters:** See scores and expert notes only; **never** any interview recording.
- **Skill Passport (Tech):** Issued only after Stage 5 pass. Annual re-verification (Stage 5 only). Non-Tech badge expires after 1 year; re-take Stage 2 only.

---

## 1. Product overview

### 1.1 Vision

**ProvenHire** is India’s first skill-certified hiring network. Candidates prove their skills once through a structured verification process; recruiters get access to a pre-verified talent pool and hire faster.

### 1.2 Value proposition

| Audience | Value |
|----------|--------|
| **Job seekers** | Prove skills once (3-stage verification), get a Skill Passport, apply to jobs (including premium roles), “interview once, use everywhere.” |
| **Recruiters** | Access verified candidates, post jobs for free, use AI-powered matching and AssignmentAI workflow, reduce time-to-hire. |
| **Admin** | Oversee users, jobs, proctoring, appeals, and platform health. |

### 1.3 Tagline and messaging

- **Hero:** “Verified Talent, Not Resumes”
- **Sub:** “Prove your skills once. Get hired faster.”
- **Employer:** “Hire Verified Talent Faster”

---

## 2. User personas and roles

### 2.1 Job seeker

- **Goal:** Get verified, build profile, apply to jobs (including premium), track applications.
- **Entry:** Homepage → Get Verified / Sign In → Sign up (email → password link) or Login (email-first → password).
- **Post-login:** Job Seeker Dashboard → Verification (if incomplete) → Jobs.

### 2.2 Recruiter

- **Goal:** Post jobs, search candidates, use AssignmentAI methodology, manage applications.
- **Entry:** For Employers → Sign up/Login (email, company name for signup).
- **Post-login:** Recruiter Dashboard → Post Job, Candidate Search, AssignmentAI Docs, Onboarding.

### 2.3 Admin

- **Goal:** Manage platform: job seekers, recruiters, jobs, proctoring, appeals, messaging.
- **Entry:** `/admin` → Email + password (Supabase Auth); role in `user_roles` = `admin`.
- **Post-login:** Admin Dashboard (tabs: Overview, Job Seekers, Recruiters, Jobs, Proctoring, Appeals, etc.).

---

## 3. System context and tech stack

### 3.1 Frontend

- **Stack:** React 18, Vite, TypeScript, React Router v7, TanStack Query, Tailwind CSS, shadcn/ui, Sonner.
- **Deployment:** Vercel (SPA; all routes rewrite to `/` via `vercel.json`).

### 3.2 Backend and data

- **Primary:** Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime).
- **Auth:** Supabase Auth (email/password, magic link for password setup, recovery flow).
- **Optional:** Local resume parser (Python, Qwen-based LLM) for resume auto-fill; frontend uses `VITE_LOCAL_RESUME_PARSER_URL` when set.

### 3.3 Key integrations

- **Supabase:** Auth, DB (RLS), Storage (resumes, recordings), Edge Functions (`analyze-resume`, `parse-job-description`), RPC (`email_login_status`).
- **Local resume parser:** HTTP POST to `/parse` with resume text; returns structured JSON for profile fields.

---

## 4. Routes and information architecture

### 4.1 Public routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Index (Home) | Hero, how verification works, AI transparency, CTA to auth and For Employers |
| `/auth` | Auth | Login, Signup, Forgot password, Reset password (mode via query/hash) |
| `/jobs` | Jobs | Job listing (search, filters); premium jobs gated by verification |
| `/about` | About | Company/product story |
| `/for-employers` | For Employers | Recruiter value prop, CTA to sign up as recruiter |

### 4.2 Job seeker protected routes

| Path | Page | Guard |
|-----|------|--------|
| `/dashboard/jobseeker` | Job Seeker Dashboard | `ProtectedRoute` (role = jobseeker) |
| `/verification` | Verification Flow | `ProtectedRoute` (role = jobseeker) |

### 4.3 Recruiter protected routes

| Path | Page | Guard |
|-----|------|--------|
| `/dashboard/recruiter` | Recruiter Dashboard | `ProtectedRoute` (role = recruiter) |
| `/dashboard/recruiter/assignmentai` | AssignmentAI Docs | Recruiter |
| `/dashboard/recruiter/onboarding` | Recruiter Onboarding | Recruiter |
| `/post-job` | Post Job | Recruiter |
| `/candidate-search` | Candidate Search | Recruiter |

### 4.4 Admin routes

| Path | Page | Guard |
|-----|------|--------|
| `/admin` | Admin Login | None (redirect to dashboard if already admin) |
| `/admin/dashboard` | Admin Dashboard | Supabase session + `user_roles.role = 'admin'` |

### 4.5 Fallback

- `*` → NotFound (404).

---

## 5. Job seeker flow (end-to-end)

### 5.1 Discovery and signup

1. User lands on **Homepage** (`/`).
2. Clicks **Get Verified Now** or **Sign In** → `/auth`.
3. **New user:** Chooses Sign up → enters **email** → selects role **Job seeker** → clicks “Send password setup link.”
4. Supabase sends **recovery/password-set** email; user clicks link → lands on `/auth?mode=reset` (with hash tokens).
5. App hydrates session from URL, shows **Create Your Password**; user sets password and submits.
6. After success → redirect to **Login** with email pre-filled (or directly to dashboard per implementation).
7. User signs in with email + password → **role resolved** → redirect to `/dashboard/jobseeker`.

### 5.2 Login (existing job seeker)

1. `/auth` → **email-first:** user enters email only → “Continue” (or “Check email”).
2. Frontend calls RPC **`email_login_status(email)`** (reads from `auth.users`):
   - **Not found** → redirect to Sign up with email pre-filled and message “No account found…”
   - **Found, inactive** → show “This account is inactive. Please contact support.”
   - **Found, no password / pending activation** → show “Account pending activation” (e.g. set password via link).
   - **Found, active, has password** → show **password** field; user enters password → Sign in.
3. On invalid password: stay on login, show **“Invalid credentials”** (no redirect to signup).
4. On success: redirect to `/dashboard/jobseeker` (or recruiter dashboard if role = recruiter).

### 5.3 Job seeker dashboard

- **Profile completeness:** Card showing % (personal details, education, skills, resume).
- **Verification progress:** Progress bar and stages (Profile Setup → Aptitude → DSA → Expert Interview); CTA to continue or start verification.
- **Quick actions:** Start Verification, Browse Jobs, Skill Passport (when verified), Refer a Friend.
- **Recent applications and saved jobs:** List with links to jobs.
- **Settings:** Edit profile (bio, location, phone, skills), Change password.
- **Verification gate:** For premium jobs or certain actions, unverified users see VerificationGateDialog and are prompted to complete verification.

### 5.4 Verification flow (four stages)

User must be logged in as job seeker. Stages are sequential; completed stages can be revisited (e.g. retry with cooldown where applicable).

#### Stage 1: Profile setup

- **Steps:** Personal Details → Education → Professional → Skills (wizard).
- **Resume upload:** PDF/DOC/TXT; “Analyze with AI” calls local parser (if configured) or Supabase `analyze-resume` Edge Function; fallback = client-side heuristic parse.
- **Auto-fill:** Name, email, phone, location, bio, college, degree, field of study, graduation year (last year in education), experience, current company/role, join date, currently working, salary, skills, certifications, languages, etc. Preview before “Continue to Verification.”
- **Completion:** Save to `job_seeker_profiles` and `verification_stages` (profile_setup = completed); unlock Stage 2.

#### Stage 2: Aptitude test

- **Question types:** Logical and Aptitude only (no Verbal, no Data Integrity in current scope).
- **Proctoring:** Fullscreen required; optional webcam/screen recording; user must allow permissions and re-enter fullscreen if exited.
- **UI:** “Question X of Y,” fullscreen indicator/banner, Submit at end.
- **Result:** Stored in `aptitude_test_results`; cooldown before retake (e.g. RETAKE_COOLDOWN_HOURS); can be invalidated by admin (then retry allowed).
- **Completion:** Mark stage `aptitude_test` completed; unlock Stage 3.

#### Stage 3: DSA round

- **Content:** Coding/DSA problems in-browser (e.g. Monaco editor).
- **Proctoring:** Fullscreen enforced; same pattern as aptitude (indicator, re-entry).
- **Result:** Stored in `dsa_round_results`; cooldown and invalidation similar to aptitude.
- **Completion:** Mark stage `dsa_round` completed; unlock Stage 4.

#### Stage 4: Expert (AI) interview

- **Flow:** Intro → Record answers to questions (video/audio) → Submit → AI analysis → Feedback per question and overall.
- **Question types:** Behavioral, technical, situational, domain (tech vs non-tech clarified in UI).
- **Proctoring:** Optional practice mode; recording with consent; sessions stored in `ai_interview_sessions` and `ai_interview_responses`.
- **Completion:** Mark stage `expert_interview` completed; user can “Return to Dashboard.”
- **Post-completion:** Always show “Return to Dashboard” (and optionally “Retry” where allowed); no dead-end.

### 5.5 Jobs page (job seeker view)

- **Listing:** All jobs (from DB or static list); each job has `isPremium` (or DB equivalent).
- **Verification gate:** If user is **not verified** and job is **premium:** apply/save/compare disabled; show “Verify to unlock this premium role.”
- **Verified user:** Full access to apply, save, compare (up to N jobs in comparison).
- **Features:** Search, filters (e.g. location, job type, experience), Job details dialog, Skill gap analysis, Job alerts (settings), Verified benefits banner for verified users.
- **Indian context:** Placeholders (names, locations, phone, currency) use Indian context (e.g. INR, Indian cities).

### 5.6 Post-verification

- **Skill Passport:** Summary of verification (levels A/B/C if applicable) and shareable view.
- **Refer a friend:** Referral code; benefits include “Exclusive access to premium job listings.”

---

## 6. Recruiter flow (end-to-end)

### 6.1 Signup and login

- **Signup:** Email only (no full name); role = Recruiter; **company name** required. Password setup via email link (same as job seeker).
- **Login:** Same email-first flow; after password check, redirect to `/dashboard/recruiter`.

### 6.2 Recruiter dashboard

- **Stats:** Active jobs, total applicants, interviews scheduled, hired, profile views.
- **Jobs list:** Recruiter’s jobs; view applications, edit, delete (with confirm).
- **Recruitment analytics:** Panel/charts for funnel or key metrics.
- **Links:** Post Job, Candidate Search, AssignmentAI Docs, Onboarding, Settings (profile, change password).

### 6.3 Post job

- **Form:** Title, company, description, location, job type, salary range, experience required, required skills (tags).
- **Optional:** Upload JD file → “Parse with AI” (Edge Function `parse-job-description`) to auto-fill fields.
- **Submit:** Insert into `jobs` with `recruiter_id` = current user.

### 6.4 Candidate search

- Recruiters search/filter candidates (e.g. by skills, experience, verification status); view profiles and resume (ResumeViewButton).

### 6.5 AssignmentAI documentation

- **Route:** `/dashboard/recruiter/assignmentai`.
- **Content:** Rendered from `/docs/assignmentai.md` (AssignmentAI ideology, workflow, how to use the platform).
- **Purpose:** Align recruiters with “AssignmentAI” methodology and product philosophy.

### 6.6 Recruiter onboarding

- Optional onboarding path (e.g. company details, hiring preferences) stored in `profiles`; `onboarding_completed` flag when done.

---

## 7. Admin flow

### 7.1 Access

- **Login:** `/admin` → email + password (Supabase Auth). User must exist in `auth.users` and have `user_roles.role = 'admin'`.
- **Adding admin:** Insert/update in `user_roles`: `user_id` (from `auth.users`) and `role = 'admin'`. Admin sets password via Supabase “Reset password” flow (recovery email).

### 7.2 Admin dashboard

- **Overview:** Counts (job seekers, recruiters, jobs, subscribers); optional audit / recent admin actions.
- **Tabs/sections:** Job Seekers (list, search, filter by status/verification), Recruiters, Jobs, Subscribers.
- **Proctoring:** ProctoringReview, ProctoringAnalytics, RealtimeProctoringAlerts (alerts from `proctoring_alerts`).
- **Test appeals:** TestAppealsManager — list appeals from `test_appeals`, respond, approve/reject.
- **AI interview review:** AIInterviewReview — review AI interview sessions and responses.
- **Messaging:** Send messages to job seekers/recruiters (stored in `admin_messages`).

### 7.3 Security

- Admin routes must enforce server/session check (Supabase Auth) and role from `user_roles`; no client-only role check for sensitive actions.

---

## 8. Authentication and authorization

### 8.1 Auth states

- **Logged out:** Nav shows “Sign In” / “Get Started”; protected routes redirect to `/auth` or role-specific entry.
- **Logged in:** Nav shows “Dashboard” (role-based link) and “Sign Out”; `AuthContext` exposes `user`, `userRole`, `loading`.

### 8.2 Role resolution

- On auth state change, app fetches role from `user_roles` (by `user.id`). Until `userRole` is resolved, protected routes with `allowedRole` show loading (no redirect loop).
- **Recruiter** → `/dashboard/recruiter`; **Job seeker** → `/dashboard/jobseeker`; **Admin** → access to `/admin/dashboard` (admin UI checks role).

### 8.3 Password and recovery

- **Signup:** No password on signup; “Send password setup link” triggers Supabase recovery; user sets password via link → `mode=reset` with tokens in hash.
- **Reset flow:** Tokens in URL persisted (e.g. sessionStorage) so that “Update password” submission can call `updatePassword` with valid session; on success, redirect to login with success message.
- **Site URL:** Must match Supabase project (e.g. `http://localhost:8080` for dev, production URL for prod) so recovery links land on correct origin.

### 8.4 Email-first login (current behavior)

1. User enters email → call `email_login_status(email)`.
2. Not found → redirect to signup with email pre-filled.
3. Inactive / no password → show appropriate message (no redirect to signup for “wrong password”).
4. Active + has password → show password field; on submit, `signIn(email, password)`; on error show “Invalid credentials.”

---

## 9. Data model (key entities)

### 9.1 Auth and users

- **auth.users:** Supabase managed (email, password, email_confirmed_at, etc.).
- **user_roles:** `user_id`, `role` (enum: jobseeker | recruiter | admin).
- **profiles:** Extended profile per user (e.g. `user_id`, full_name, email, phone, company_name, company_website, designation, industry, hiring_for, onboarding_completed, referral fields). Created by trigger on first user signup.

### 9.2 Job seeker

- **job_seeker_profiles:** user_id, bio, education (college, degree, field_of_study, graduation_year, cgpa), professional (current_company, current_role, experience_years, join_date, currently_working, notice_period, salaries, etc.), skills, certifications, languages, resume_url, verification_status, etc.
- **verification_stages:** user_id, stage_name (profile_setup | aptitude_test | dsa_round | expert_interview), status, score, completed_at.
- **aptitude_test_results:** user_id, scores (logical, verbal, data_integrity), passed, screen_recording_url, is_invalidated, invalidated_at.
- **dsa_round_results:** user_id, problems_attempted/solved, total_score, passed, screen_recording_url, is_invalidated.
- **ai_interview_sessions / ai_interview_responses:** session, user, questions, transcript, video_url, ai_score, ai_feedback, is_flagged.

### 9.3 Jobs and applications

- **jobs:** recruiter_id, title, company, description, location, job_type, salary_range, experience_required, required_skills, status. (Premium: via `is_premium` or static list; 20 static jobs in code, 10 premium.)
- **job_applications:** job_id, job_seeker_id, resume_url, status, applied_at, cover_letter.
- **saved_jobs:** user_id, job_id, saved_at.

### 9.4 Recruiter

- **profiles:** recruiter fields (company_name, designation, onboarding_completed, etc.).

### 9.5 Admin and platform

- **admin_messages:** recipient_id, subject, message, is_read, read_at.
- **proctoring_alerts:** user_id, test_type, test_id, alert_type, severity, message, violation_details.
- **test_appeals:** user_id, test_type, test_id, appeal_reason, status, admin_response, reviewed_by.
- **newsletter_subscribers:** email, is_active, source.
- **referrals:** referrer_id, referred_user_id, referral_code, status, verified_at.

### 9.6 Unique identifiers

- Tables use UUID primary keys; for analytics and support, human-friendly unique identifiers (e.g. prefixed codes) can be added per entity for easier reference.

---

## 10. Integrations and external services

### 10.1 Supabase

- **Auth:** Sign up, sign in, reset password, update password, session refresh.
- **Database:** All tables above; RLS policies per table (e.g. users can read/write own rows; `auth.uid()` = user_id).
- **Storage:** Resume uploads, screen recordings (if used).
- **Edge Functions:** `analyze-resume` (resume → structured profile), `parse-job-description` (JD file → job fields).
- **RPC:** `email_login_status(email)` → { exists, is_active, has_password } from auth.users.

### 10.2 Local resume parser (optional)

- **Purpose:** Alternative or fallback for resume auto-fill.
- **Stack:** Python, llama-cpp-python, Qwen2.5-1.5B GGUF.
- **API:** POST to `VITE_LOCAL_RESUME_PARSER_URL/parse` with resume text; response = JSON (name, education, experience, skills, etc.).
- **Frontend:** ProfileSetupStage tries local parser first, then Edge Function, then client-side heuristic.

---

## 11. Non-functional requirements

### 11.1 UX and copy

- **Tone:** Professional, clear, consistent.
- **CTAs:** Standard labels: “Continue,” “Start Test,” “Submit” (avoid mixing “Start Proctored Test” vs “Start Coding Round” without hierarchy).
- **Forms:** Helper text for complex fields (skills, salary, notice period, join date).
- **Empty states:** Descriptive messages and guidance (no raw “No data”).
- **Fullscreen tests:** Persistent “Fullscreen: On/Off” indicator; re-entry option if user exits.

### 11.2 Localization and context

- **Indian context:** Placeholders and sample data use Indian names, cities, phone format (+91), currency (INR) where applicable.

### 11.3 Security and reliability

- **Admin:** Server/session + DB role check; no client-only admin access.
- **Resume AI failure:** Show clear fallback message and “Continue manually” path; do not block profile completion.

### 11.4 Deployment

- **Vercel:** SPA rewrites so every path serves `index.html` (avoid 404 on refresh). Config in `vercel.json`.

---

## 12. Out of scope (current PRD)

- Switching fully to local PostgreSQL (no Supabase): noted as possible future change; current PRD assumes Supabase.
- Social login (Google/GitHub).
- Mobile app or native apps.
- Payments or subscriptions (premium jobs are gated by verification status, not payment).
- Detailed analytics (e.g. recruiter funnel) is high-level in this PRD; exact metrics and charts are product decisions.

---

## 13. Document history

| Version | Date | Changes |
|--------|------|---------|
| 1.0 | Feb 2025 | Initial full PRD: personas, routes, job seeker/recruiter/admin flows, verification stages, auth, data model, integrations, NFRs. |

---

*This PRD is the single source of truth for ProvenHire product behavior from top to bottom and start to end. Update this document when features or flows change.*
