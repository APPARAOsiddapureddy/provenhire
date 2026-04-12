# PRD: Recruiter — Complete Product Requirements

**Version:** 1.1 (recruiter) · **Product doc set:** 6.9  
**Date:** April 2026  
**Status:** Final (revenue rules aligned with implementation)  
**Author:** ProvenHire Product Team  

**Doc set:** [PRD.md](PRD.md) (index) · **Candidate platform:** [PRD_CANDIDATE.md](PRD_CANDIDATE.md) · **Business / revenue:** [PRD_BUSINESS.md](PRD_BUSINESS.md) · **AI interview spec:** [PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md) · [docs/README.md](README.md) · **Test recruiter seed:** `server/prisma/seed-recruiter.ts`

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
- **Razorpay / automated billing** — manual UPI + admin plan update until volume threshold (see **[PRD_BUSINESS.md](PRD_BUSINESS.md)**)

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

### 7.6 Post–AI Expert: employer chooses the next interview (implemented)

After a candidate completes the **AI Expert Interview** (verification), **the hiring employer** decides the next step for that application — not an automatic ProvenHire default:

| Mode | Meaning |
|------|---------|
| **provenhire_ai** | Continue with a ProvenHire AI / JD-aligned screening (product lane as wired). |
| **human_expert** | Unlock **ProvenHire Human Expert** (booked slot, paid flow as today). |
| **company_employee** | Employer runs their own on-site / team interview; no ProvenHire Human Expert unlock for that review cycle. |

**API (recruiter, owns job):**

```
PATCH /api/jobs/recruiter/applications/:applicationId/next-interview
  Body: { "mode": "provenhire_ai" | "human_expert" | "company_employee" }
```

**Persistence:** **`JobApplication`**: **`recruiterNextInterviewMode`**, **`recruiterInterviewPathSetAt`**, **`recruiterInterviewPathSetByUserId`** (migration **`20260413120000_job_application_recruiter_interview_path`**). Service: **`server/src/services/recruiterInterviewPath.service.ts`**.

**Queue behavior:** **`human_expert`** calls **`approveAdminReviewQueueForHumanExpert`** (same unlock as admin approve — **`human_expert_interview`** **`in_progress`**, slot request **`eligible`**). **`provenhire_ai`** / **`company_employee`** set **`AdminReviewQueue`** to **`recruiter_redirected`** (no Human Expert unlock). Applicant APIs expose the new fields for dashboards.

**UI:** Job applicants grid (`/dashboard/recruiter/jobs/:jobId/applicants`) — per-applicant selector when the candidate has completed AI Expert. **`JobSeekerDashboard`** Human Expert card reflects employer choice (waiting / in progress / employer chose another path). Admin queue approval remains available for platform operations; employer selection is the primary product gate for hiring flows.

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

**Canonical tables and business rules:** **[PRD_BUSINESS.md](PRD_BUSINESS.md)**. Below: recruiter-product summary + **implemented** API hooks.

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

Aligns with **[PRD_BUSINESS.md](PRD_BUSINESS.md)** §5: grid → full resume (no PII) → post-acceptance identity → phone last.

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

You now have access to our pool of verified candidates — each one assessed through our verification pipeline (cognitive, live coding, AI interviews, and optional human expert — see [PRD_CANDIDATE.md](PRD_CANDIDATE.md) §3).

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
| PRD document | `docs/PRD_RECRUITER.md` (this file) |
| Prisma | `RecruiterUsage` (+ `subscriptionTier`, `contactCountMonth`, `jdInterviewCountMonth`); migrations through `20260411160000_revenue_prd4_usage_retakes` |
| REST & UI in §12 | **Usage:** `GET /api/users/me/recruiter-subscription`; **contact:** `POST /api/notifications/contact-candidate`; align analytics gating with **Growth** tier |

*PRD v1.1 — April 2026 | ProvenHire Product Team*  
*Revenue numbers and tier rules: **[PRD_BUSINESS.md](PRD_BUSINESS.md)**.*

