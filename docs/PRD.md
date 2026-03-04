# ProvenHire — Product Requirements Document (PRD)

**Version:** 5.0  
**Last Updated:** February 2026  
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
| 2 | Aptitude Test | Logical reasoning, CS fundamentals | Score recorded |
| 3 | DSA Round | Coding challenges, problem-solving | Score recorded |
| 4 | AI Expert Interview | Structured AI-led technical interview | Score recorded |
| 5 | Human Expert Interview | Live video interview with expert interviewer | Pass ≥70% |

**Shortlisting (Stage 4 → 5):** Combined score (Stage 2: 25%, Stage 3: 35%, Stage 4: 40%) ≥ 65% unlocks Stage 5.

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

JobSeekerProfile (verificationStatus, roleType)
  verificationStatus: pending | verified | expert_verified
  roleType: technical | non_technical
```

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
| `/about` | Public | About |
| `/for-employers` | Public | Employer marketing |
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
- Find Jobs, For Employers, Careers, About

### Recruiter
- Find Jobs (hidden), For Employers, Careers, About

### Expert Interviewer
- **Minimal:** Logo, Dashboard, Notifications, Sign out only (no Find Jobs, Employers, Careers, About)

### Admin
- Full nav as applicable

---

## 10. Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Expert Interviewer | interviewer@test.provenhire.com | Test123456 |

Seed: `cd server && npm run seed:interviewer`

---

## 11. Non-Functional Requirements

- **Security:** JWT auth, role-based access, protected routes
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

*PRD v5.0 — February 2026*
