# ProvenHire Product Requirement Document

**Version 1.0**  
**Last updated:** March 2025  
**Document type:** Product Requirements — Ideology & User Journeys

---

## Product Overview

ProvenHire is an AI-powered talent verification and hiring platform that builds a **trusted pool of verified candidates** for companies to hire from.

Unlike traditional job boards that rely on resumes alone, ProvenHire verifies candidates through structured assessments, AI interviews, and communication evaluations. A **three-level certification hierarchy** (Cognitive Verified → Skill Passport → Elite Verified) lets candidates **see jobs as soon as they complete Level 1**, while better jobs unlock with higher levels. This reduces drop-off compared to all-or-nothing verification. Companies gain access to talent validated at the right tier for each role—from entry-level to senior—reducing hiring time and improving quality of hire.

---

## Problem Statement

### For Companies

- **Too much noise, too little signal.** Companies spend weeks sifting through thousands of resumes, most of which do not match the role or are inflated or inaccurate.
- **Interviews are expensive.** Every screening call and onsite interview costs time and money. Companies repeat the same assessments across hundreds of candidates.
- **Unverified skills.** Resumes promise expertise; reality often differs. Companies discover skill gaps only after hiring.
- **Long time-to-hire.** From posting a job to making an offer often takes months, especially for technical roles.

### For Job Seekers

- **Applying feels futile.** Submitting applications into black holes with no feedback or sense of progress.
- **Unfair comparisons.** Candidates are judged on formatting and keyword optimization, not on actual ability.
- **No way to prove skills.** Beyond a resume, candidates lack a credible way to demonstrate competence.
- **Repetitive processes.** Every company runs its own tests and interviews; effort is not reusable.

---

## Product Vision

**A world where hiring is faster, fairer, and based on verified talent.**

ProvenHire envisions a hiring ecosystem where:

- Candidates prove their skills **once**, through structured, proctored assessments.
- Companies access a **pre-verified talent pool** instead of unverified applicant stacks.
- Hiring decisions rest on **demonstrated performance**, not just claims.
- Both sides save time: candidates avoid repetitive applications; companies avoid redundant screening.

---

## Product Mission

To **verify talent at scale** and **make verified talent discoverable**, so that companies can hire with confidence and candidates can be judged on merit.

---

## Core Product Philosophy

1. **Progressive verification, progressive access.** Candidates see jobs as soon as they reach Level 1 (Cognitive Verified). Higher levels unlock better jobs—reducing drop-off while still incentivizing full verification.

2. **Evidence over claims.** Every score, skill tag, and report is backed by an assessment or interview. No self-reported-only data.

3. **Fair by design.** Standardized assessments and clear evaluation criteria reduce bias. Proctoring protects integrity.

4. **Candidates own their proof.** A verified profile is portable. Candidates can use it across companies and roles.

5. **Companies save time.** Discovery is built for speed: filter by certification level, skills, scores, and verification status. No need to re-run basic checks.

---

## Certification Level Progress

ProvenHire uses a **three-level certification hierarchy**. Candidates advance through levels by completing verification stages. Each level unlocks **tiered job visibility**—candidates see jobs earlier in their journey, but job quality improves as they progress.

### Level 0 — Not Yet Certified

- **Status:** New signup or profile incomplete.
- **Job visibility:** No job access. Must complete Profile Setup to advance.
- **Purpose:** Baseline; encourages candidates to complete profile and start verification.

### Level 1 — Cognitive Verified

**Requirements:**
- Profile Setup
- Aptitude Test

- **Status:** Cognitive and reasoning ability verified.
- **Job visibility:** Can **see and apply to entry-level and junior roles**. Limited job pool—basic opportunities.
- **Purpose:** Reduces drop-off by giving early value. Candidates experience the platform and build motivation to continue.
- **Recruiter value:** Entry-level, internship, or high-volume hiring.

### Level 2 — Skill Passport

**Requirements (in addition to Level 1):**
- DSA Round
- AI Expert Interview

- **Status:** Coding ability and communication validated.
- **Job visibility:** Can **see mid-level and standard roles**. Broader job pool—most roles on the platform.
- **Purpose:** Core talent tier for most hiring needs.
- **Recruiter value:** Mid-level, standard technical roles, most product/engineering hires.

### Level 3 — Elite Verified

**Requirements (in addition to Level 2):**
- Human Expert Interview

- **Status:** Depth and fit validated by an expert interviewer.
- **Job visibility:** Can **see premium, senior, and leadership roles**. Full access to best opportunities.
- **Purpose:** Elite tier for experienced and senior talent.
- **Recruiter value:** Senior, staff, principal, and leadership roles.

### Tiered Job Visibility Summary

| Certification Level | Job Access | Typical Roles |
|---------------------|------------|---------------|
| Level 0 | None | — |
| Level 1 — Cognitive Verified | Entry-level, junior | Internships, Junior Dev, Associate |
| Level 2 — Skill Passport | Mid-level, standard | SDE 2, Mid-level, Most roles |
| Level 3 — Elite Verified | Premium, senior, leadership | Senior, Staff, Principal, Lead |

### Design Rationale

- **Reduce drop-off:** All-or-nothing verification causes high abandonment. By unlocking jobs at Level 1, candidates get immediate value and are more likely to continue.
- **Align incentives:** Better jobs require higher verification. Candidates are motivated to complete DSA and AI interview (Level 2) and Expert interview (Level 3) for better opportunities.
- **Recruiter flexibility:** Recruiters can post jobs at different tiers and filter candidates by certification level.

---

## User Roles

### Job Seeker

**Purpose of using the platform**  
To demonstrate their skills, build a verified profile, and **progress through certification levels** to access better job opportunities.

**Actions they perform**

- Sign up and complete email verification.
- Build a profile (resume, education, experience, skills, target role) — **unlocks Level 1 path**.
- Complete Aptitude Test — **reaches Level 1 (Cognitive Verified)**; can see entry-level jobs.
- Complete DSA Round and AI Expert Interview — **reaches Level 2 (Skill Passport)**; can see mid-level and standard jobs.
- Complete Human Expert Interview — **reaches Level 3 (Elite Verified)**; can see premium and senior roles.
- View certification level, scores, feedback, and verification status.
- Browse and apply to jobs according to their certification level.
- Appear in the talent pool for recruiters; visibility and job eligibility depend on level.
- Respond to recruiter outreach (when applicable).

**Benefits they receive**

- **Early job access:** See and apply to jobs as soon as Level 1 is reached—no need to complete everything first.
- **Progressive rewards:** Better jobs unlock with higher levels; clear motivation to continue.
- A single, trusted proof of ability instead of repeated tests at every company.
- Clear feedback on strengths and areas to improve.
- Transparent, structured process instead of opaque application systems.

---

### Recruiter

**Purpose of using the platform**  
To discover and hire pre-verified candidates quickly, with high confidence in skills and fit, at the right certification level for each role.

**Actions they perform**

- Create a company/recruiter profile.
- Post jobs and assign **minimum certification level** (Level 1, 2, or 3) based on role seniority.
- Search and filter the talent pool by **certification level**, skills, scores, and role.
- View candidate profiles, certification level, verification reports, and evaluation summaries.
- Shortlist candidates and reach out (in-app or via contact details).
- Track hiring pipeline and outcomes.
- Match jobs with candidates who meet the required level and skills.

**Benefits they receive**

- **Tiered talent pool:** Access Level 1 candidates for entry-level roles, Level 2 for mid-level, Level 3 for senior—each tier matches role requirements.
- Access to candidates who have already passed assessments—no need to re-run basic screening.
- Faster time-to-hire by starting with qualified, verified talent.
- Higher quality of hire through evidence-based selection.
- Clear visibility into candidate strengths, fit, and certification tier via structured data.

---

### Interviewer (Expert)

**Purpose of using the platform**  
To conduct expert-level interviews for experienced candidates and contribute to the verification process.

**Actions they perform**

- Apply to become an interviewer and get onboarded.
- Set availability and accept interview slots.
- Conduct live interviews (video) for candidates in the expert stage.
- Evaluate candidates on depth, communication, and role fit.
- Submit evaluations and scores.
- Manage calendar and slots.

**Benefits they receive**

- Flexible, scheduled interviews aligned with their availability.
- A structured evaluation framework instead of ad hoc assessments.
- Contribution to a system that improves hiring quality.
- Compensation for their time (when applicable).

---

### Admin

**Purpose of using the platform**  
To configure, operate, and maintain the platform so it runs smoothly and stays trustworthy.

**Actions they perform**

- Manage users (candidates, recruiters, interviewers).
- Oversee and review the verification pipeline (questions, rubrics, thresholds).
- Monitor proctoring events and review flagged sessions.
- Manage questions, difficulty levels, and topic tags.
- View dashboards, metrics, and reports.
- Handle appeals and edge cases.
- Configure system settings (stages, pass thresholds, notifications).

**Benefits they receive**

- End-to-end visibility into platform health and quality.
- Control over standards and integrity.
- Ability to intervene and correct issues.
- Data to improve questions and processes over time.

---

## Candidate Journey

### 1. Awareness & Onboarding

- Candidate learns about ProvenHire (referral, job board, or direct).
- Lands on the platform and understands the value: “Get verified in stages—see jobs from Level 1, better jobs as you advance.”
- Signs up with email, completes verification, and selects role (e.g., Job Seeker).
- Chooses track (Technical vs. Non-Technical) based on target role.

### 2. Profile Setup

- Uploads resume; system parses experience, education, and skills.
- Completes profile fields: target job title, experience years, location, notice period, etc.
- Reviews skill tags and corrections.
- Profile becomes the baseline for verification and matching.
- **Remains at Level 0** until Aptitude Test is passed.

### 3. Level 1 — Cognitive Verified

- **Aptitude Test:** Timed MCQ assessment. Must meet a passing threshold.
- On pass: **Level 1 achieved.** Candidate can now **see and apply to entry-level jobs**.
- Job board unlocks with Level 1–eligible roles (junior, internship, associate).
- Clear prompt: “Complete DSA and AI Interview to unlock more roles.”

### 4. Level 2 — Skill Passport

- **DSA Round:** Coding challenges with automatic evaluation.
- **AI Expert Interview:** Conversational AI interview; answers evaluated on clarity, correctness, and communication.
- On pass for both: **Level 2 achieved.** Candidate can **see mid-level and standard jobs**.
- Job board expands to most roles on the platform.
- Prompt: “Complete Human Expert Interview for senior and premium roles.”

### 5. Level 3 — Elite Verified

- **Human Expert Interview:** Live interview with an expert (for experienced candidates).
- On pass: **Level 3 achieved.** Candidate can **see premium, senior, and leadership roles**.
- Full job access. Profile highlighted as Elite Verified for recruiters.

### 6. Discovery & Hiring

- At each level, candidate browses jobs they are eligible for.
- Recruiters search and filter by certification level; candidate appears when level matches.
- Recruiter views profile, certification level, and verification report, then reaches out.
- Candidate responds to outreach; hiring proceeds outside or within the platform.
- Candidate may receive job recommendations based on level and profile.

---

## Recruiter Journey

### 1. Onboarding

- Recruiter signs up and creates a company profile.
- Completes onboarding: company details, hiring needs, roles.
- Gains access to the talent pool and search.

### 2. Discovery

- Searches by skills, experience, verification status, scores, and role.
- Filters by DSA score, AI interview score, or completion stage.
- Browses candidate cards with key verification highlights.

### 3. Evaluation

- Opens a candidate profile.
- Reviews verification report: aptitude, DSA, AI interview scores and feedback.
- Checks proctoring summary (no major violations, etc.).
- Decides whether to shortlist or reach out.

### 4. Outreach & Hiring

- Shortlists candidates and sends messages or requests contact.
- Manages pipeline (contacted, interviewed, offered, hired).
- Tracks outcomes (hired, declined, etc.) for learning and reporting.

### 5. Ongoing Use

- Posts new jobs and matches with verified candidates.
- Repeats discovery and hiring for new roles.
- Uses platform as primary source for qualified technical (or non-technical) talent.

---

## Candidate Verification Pipeline

The verification pipeline is structured around **certification levels**. Each level corresponds to job visibility and recruiter discovery.

### Level-to-Stage Mapping

| Level | Name | Required Stages | Job Visibility |
|-------|------|-----------------|-----------------|
| **0** | Not Yet Certified | Profile Setup (in progress) | None |
| **1** | Cognitive Verified | Profile Setup + Aptitude Test | Entry-level, junior roles |
| **2** | Skill Passport | Level 1 + DSA Round + AI Expert Interview | Mid-level, standard roles |
| **3** | Elite Verified | Level 2 + Human Expert Interview | Premium, senior, leadership roles |

### Stage Details (Technical Track)

| Stage | Purpose | Output | Unlocks |
|-------|---------|--------|---------|
| Profile & Resume | Baseline data and intent | Profile completeness | Path to Level 1 |
| Aptitude Test | General aptitude and reasoning | Score, pass/fail | Level 1 — Cognitive Verified |
| DSA Round | Coding ability and problem-solving | Score, code quality | — |
| AI Expert Interview | Communication, domain knowledge, clarity | Score, feedback | Level 2 — Skill Passport |
| Human Expert Interview | Depth and fit for senior roles | Score, qualitative feedback | Level 3 — Elite Verified |

### Progression Rules

- Candidates must pass each stage to advance to the next level.
- Retake policies (e.g., cooldown, max attempts) apply where defined.
- Integrity signals (proctoring events, violations) can affect level or trigger review.
- Level is **deterministic:** Level 2 implies Level 1 passed; Level 3 implies Level 2 passed.

### Verification Outcomes

- **Level 0:** Not yet certified; no job access.
- **Level 1:** Cognitive Verified; entry-level job access; visible to recruiters hiring for Level 1 roles.
- **Level 2:** Skill Passport; mid-level and standard job access; visible for Level 2+ roles.
- **Level 3:** Elite Verified; full job access; visible for all roles including premium/senior.
- **Under review:** Flagged for integrity; may be limitedly visible or paused.

---

## Candidate Profile Structure

A verified candidate profile includes:

### Identity & Contact

- Name, email, phone (as shared)
- Photo (optional)

### Career Intent

- Target job title
- Experience years
- Current role, company
- Notice period
- Salary expectations (optional)

### Education & Experience

- Education (degree, institution, year)
- Work history (roles, companies, duration)
- Projects and achievements

### Skills

- Skill tags (parsed + candidate-confirmed)
- Proficiency inferred from assessments (where applicable)

### Verification Data

- **Certification level:** Level 0, 1 (Cognitive Verified), 2 (Skill Passport), or 3 (Elite Verified)
- **Stage status:** Completed, passed, failed, in progress
- **Scores:** Aptitude, Live Coding, AI interview, expert interview
- **Skill freshness:** Last verified date or expiry status per skill (Aptitude, Live Coding, Interview)
- **Feedback excerpts:** Strengths, improvement areas
- **Integrity summary:** Proctoring events, if any
- **Job eligibility:** Which job tiers the candidate can see (based on level)

### Supporting Evidence

- Resume (original upload)
- Links (GitHub, Portfolio) if provided

---

## Skill Freshness Verification System

Skill verifications (Aptitude, Live Coding, AI Interview) are valid for a fixed duration. After expiry, candidates must re-attempt to maintain verified status. This ensures recruiter trust in current, up-to-date skills.

### Skill Types and Validity

| Skill | Display Name | Validity |
|-------|--------------|----------|
| Aptitude | Aptitude Verification | 180 days |
| Live Coding | Live Coding Verification | 30 days |
| Interview | AI Interview Verification | 365 days |

### Status Values

- **ACTIVE:** Verification valid; expires in the future
- **EXPIRED:** `current_date > expires_at`; re-attempt required
- **PENDING:** Not yet completed
- **FAILED:** Candidate failed; can retry after cooldown (24h)

### Verified Candidate Badge

A candidate is **Verified** only when:
- Aptitude = ACTIVE
- Live Coding = ACTIVE
- Interview = ACTIVE

If any skill expires → **Verification Incomplete**; badge disabled until re-verification.

### Re-attempt Rules

- Cannot re-attempt while skill is ACTIVE
- After expiry → can re-attempt; new `completed_at` and `expires_at` calculated
- Admin override available for edge cases

### Notification Schedule

| Time | Action |
|------|--------|
| 7 days before expiry | Email + in-app notification |
| 3 days before expiry | Reminder |
| On expiry | Status changed to EXPIRED; email sent |

### Recruiter View

Recruiters see **freshness** for each skill:
- "Last Verified: X days ago" when ACTIVE
- "Status: Expired" when EXPIRED

Display name: **Live Coding Verification** (never "DSA Test") for recruiter trust.

---

## Recruiter Discovery System

The discovery system helps recruiters find the right verified candidates at the right certification level.

### Job Posting by Level

- When posting a job, recruiter selects **minimum certification level**:
  - **Level 1:** Entry-level, junior, internship roles
  - **Level 2:** Mid-level, standard technical roles
  - **Level 3:** Senior, staff, principal, leadership roles
- Only candidates at or above the required level can see and apply to the job.

### Search & Filter

- **Certification level:** Level 1, 2, or 3 (primary filter for role fit)
- **Skills:** Match on required skills
- **Experience:** Years of experience, seniority
- **Scores:** Minimum aptitude, DSA, or AI interview score
- **Role/track:** Technical vs. non-technical
- **Location, notice period:** When available

### Result Presentation

- Card view with key highlights: **certification level** (badge), role, experience, scores.
- Level badge visible (e.g., “Cognitive Verified,” “Skill Passport,” “Elite Verified”).
- Sort by relevance, score, level, recency.
- Quick actions: View profile, shortlist, contact.

### Match & Recommendations

- Jobs are matched with candidates who meet the **minimum certification level** and skills.
- Recruiters see “recommended” or “best fit” candidates for a role based on level and profile.
- Alerts when new verified candidates at the required level match saved searches (future).

---

## Key Product Metrics

### Candidate-Side

| Metric | Definition | Target |
|--------|------------|--------|
| **Level 1 attainment rate** | % of signups who reach Level 1 (Cognitive Verified) | Maximize; early job access drives retention |
| **Level 2 attainment rate** | % of Level 1 who reach Level 2 (Skill Passport) | Maximize |
| **Level 3 attainment rate** | % of Level 2 who reach Level 3 (Elite Verified) | Maximize for senior talent |
| **Drop-off by stage** | % abandoning before next stage | Minimize; tiered access should reduce early drop-off |
| **Stage pass rate** | % passing each stage (aptitude, DSA, AI) | Calibrate to quality bar |
| **Time to Level 1 / 2 / 3** | Days from start to each level | Minimize |
| **Profile completeness** | % of key fields filled | High |

### Recruiter-Side

| Metric | Definition | Target |
|--------|------------|--------|
| **Jobs by level** | Distribution of posted jobs (Level 1 / 2 / 3) | Balanced pool by seniority |
| **Search-to-contact rate** | % of searches that lead to outreach | Maximize |
| **Contact-to-hire rate** | Hires / contacts (by level) | Quality signal per tier |
| **Time-to-hire** | Days from first contact to offer | Minimize |
| **Recruiter retention** | Monthly active recruiters | Grow |

### Platform Health

| Metric | Definition | Target |
|--------|------------|--------|
| **Integrity rate** | % of sessions with no major proctoring violations | High |
| **Appeal rate** | % of results appealed | Low, manageable |
| **Candidate NPS** | Satisfaction with verification experience | Improve over time |
| **Recruiter NPS** | Satisfaction with talent quality | Improve over time |

---

## Long-Term Platform Goals

### Trust & Quality

- Establish ProvenHire as the standard for **verified technical talent**.
- Continuously improve assessment quality and alignment with industry needs.
- Keep integrity high through proctoring, appeals, and transparent policies.

### Scale & Coverage

- Expand to more roles (design, product, data, etc.).
- Support multiple tracks and specializations.
- Grow the verified pool so recruiters reliably find talent for common roles.

### Experience & Fairness

- Reduce time and friction in the verification journey.
- Provide useful feedback at each stage.
- Design for fairness and accessibility across backgrounds.

### Ecosystem & Integrations

- Integrate with ATS, job boards, and career sites.
- Enable “ProvenHire verified” as a portable credential.
- Partner with companies for direct talent pipeline programs.

### Business Sustainability

- Build a sustainable model (e.g., recruiter subscriptions, success fees, enterprise plans).
- Invest in product, assessment design, and support.
- Balance growth with quality and trust.

---

*This document describes product ideology, user roles, and flows. Technical architecture and implementation details are covered in separate documents.*
