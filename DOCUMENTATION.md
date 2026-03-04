# ProvenHire - Complete Project Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Application Architecture](#application-architecture)
4. [User Roles & Authentication](#user-roles--authentication)
5. [Page-by-Page Documentation](#page-by-page-documentation)
6. [Database Schema](#database-schema)
7. [User Flows](#user-flows)
8. [Backend Services](#backend-services)
9. [Design System](#design-system)

---

## Project Overview

**ProvenHire** is an AI-powered hiring platform that connects verified exceptional talent with outstanding companies. The platform differentiates itself through a rigorous multi-stage verification process for job seekers, ensuring that employers only access pre-verified candidates.

### Core Value Proposition

- **For Job Seekers**: Get verified through aptitude tests, DSA challenges, and expert interviews to stand out with a verified profile badge
- **For Employers**: Access a pool of pre-verified candidates, use AI-powered job description generation, and leverage DNA matching technology

### Key Metrics Displayed
- 95% Verified Success Rate
- 10k+ Talented Candidates  
- 500+ Partner Companies

---

## Technology Stack

| Category | Technology |
|----------|------------|
| Frontend Framework | React 18.3.1 |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Language | TypeScript |
| UI Components | shadcn/ui + Radix UI |
| State Management | React Query (TanStack Query) |
| Routing | React Router DOM 6.30.1 |
| Backend | Node.js + Express (TypeScript) |
| Database | PostgreSQL + Prisma ORM |
| AI Integration | OpenAI API |
| Notifications | Sonner Toast |
| Icons | Lucide React |

---

## Application Architecture

### Route Structure

```
/                          → Landing Page (Index.tsx)
/auth                      → Authentication Page (Sign In / Sign Up)
/jobs                      → Job Listings (Public)
/about                     → About Page (Mission & Values)
/for-employers             → Employer Landing Page

Protected Routes (Job Seeker):
/dashboard/jobseeker       → Job Seeker Dashboard
/verification              → Multi-Stage Verification Flow

Protected Routes (Recruiter):
/dashboard/recruiter       → Recruiter Dashboard
/post-job                  → Post New Job Form

/*                         → 404 Not Found
```

### Component Structure

```
src/
├── components/
│   ├── Navbar.tsx              # Global navigation
│   ├── Footer.tsx              # Global footer
│   ├── ProtectedRoute.tsx      # Auth guard component
│   └── ui/                     # shadcn/ui components
├── pages/
│   ├── Index.tsx               # Landing page
│   ├── Auth.tsx                # Authentication
│   ├── Jobs.tsx                # Job listings
│   ├── About.tsx               # About page
│   ├── ForEmployers.tsx        # Employer page
│   ├── NotFound.tsx            # 404 page
│   ├── dashboard/
│   │   ├── JobSeekerDashboard.tsx
│   │   ├── RecruiterDashboard.tsx
│   │   └── PostJob.tsx
│   └── verification/
│       ├── VerificationFlow.tsx
│       └── stages/
│           ├── ProfileSetupStage.tsx
│           ├── AptitudeTestStage.tsx
│           ├── DSARoundStage.tsx
│           └── ExpertInterviewStage.tsx
├── contexts/
│   └── AuthContext.tsx         # Authentication state
├── hooks/
│   ├── use-toast.ts
│   └── use-mobile.tsx
├── integrations/
│   └── server/
│       ├── client.ts
│       └── types.ts
└── lib/
    └── utils.ts
```

---

## User Roles & Authentication

### User Types

| Role | Description | Access |
|------|-------------|--------|
| **jobseeker** | Job seekers looking for opportunities | Verification flow, Job search, Apply to jobs, Dashboard |
| **recruiter** | Employers/HR posting jobs | Post jobs, View applicants, Recruiter dashboard |

### Authentication Flow

1. User visits `/auth`
2. Selects role (Job Seeker or Recruiter) via radio buttons
3. Signs up with email, password, and full name OR signs in
4. On successful auth, redirects to role-specific dashboard

### Role Selection UI
- Visual cards with icons (Users for Job Seeker, Briefcase for Recruiter)
- Selected state shows primary border and light background

---

## Page-by-Page Documentation

### 1. Landing Page (Index.tsx)

**Route:** `/`

**Purpose:** Main marketing page introducing ProvenHire

**Sections:**

| Section | Description |
|---------|-------------|
| **Hero** | Badge "AI-Powered Hiring Platform", headline "Where Talent Meets Opportunity", subtitle about multi-stage verification, two CTAs |
| **Stats** | Three stats with gradient text: 95% (Verified Success Rate), 10k+ (Talented Candidates), 500+ (Partner Companies) |
| **For Job Seekers** | Three cards: Multi-Stage Verification (with checklist), AI-Powered Matching, Verified Profile Badge |
| **For Employers** | Four cards in 2x2 grid: Pre-Verified Talent, AI-Powered JD Creation, DNA Matching Technology, TA Support & Onboarding |
| **Trust Banner** | Full-width gradient banner with Shield icon and integrity message |

**Visual Elements:**
- Hero background: Gradient overlay on hero image
- Cards have gradient icon containers with glow shadows
- Cyan accent checkmarks for list items

**CTAs:**
- "I'm Looking for Talent" → `/auth` (primary gradient button)
- "I'm Looking for a Job" → `/auth` (outline button)
- "Start Verification Process" → `/auth`
- "Post Your First Job Free" → `/for-employers`
- "Learn Our Story" → `/about`

---

### 2. Authentication Page (Auth.tsx)

**Route:** `/auth`

**Purpose:** Sign in and sign up for both user types

**Layout:**
- Centered card with gradient subtle background
- Scale-in animation on mount

**Features:**
- Role selector (Job Seeker / Recruiter) as visual radio cards
- Tabbed interface (Sign In / Sign Up)
- Sign Up fields: Full Name, Email, Password, Confirm Password
- Sign In fields: Email, Password
- Contextual info box showing next steps based on role
- Auto-redirect if already logged in
- Terms of Service and Privacy Policy links

**Behavior:**
- Job seekers see: "After signing up, you'll begin the verification process with aptitude tests, DSA challenges, and an expert interview."
- Recruiters see: "Post jobs for free, access verified candidates, and get AI-powered matching with TA support."
- After signup → Redirect to role-specific dashboard

---

### 3. Jobs Page (Jobs.tsx)

**Route:** `/jobs`

**Purpose:** Browse and search job listings

**Features:**
- Search bar with clear/filter button
- Job cards showing: Title, Company, Location (MapPin icon), Job Type (Briefcase icon), Salary (DollarSign icon), Posted Date (Clock icon), Required Skills as badges
- "Apply Now" button with gradient styling
- Save/Bookmark button (Bookmark/BookmarkCheck icons)
- Pagination with "Load More Jobs" button
- Resume upload dialog for first-time applicants

**Functionality:**
- Fetches jobs from `jobs` table where status = 'active'
- Filters jobs by search query (title, company, location, skills)
- Saved jobs stored in `saved_jobs` table
- Applications stored in `job_applications` table
- Shows loading spinner while fetching
- Empty state: "No jobs found matching your search."

---

### 4. About Page (About.tsx)

**Route:** `/about`

**Purpose:** Explain mission, verification process, and values

**Sections:**

| Section | Content |
|---------|---------|
| **Hero** | "Our Mission" with gradient text, subtitle about verified talent |
| **How We Verify Talent** | 4 numbered step cards |
| **Our Core Values** | 4 value cards in 2x2 grid |
| **Bottom Banner** | Gradient banner "Built for Real Talent" |

**Verification Steps (numbered circles with gradient):**
1. **Aptitude & CS Fundamentals** - Logical reasoning, problem-solving, CS basics
2. **DSA Coding Challenges** - Real-time coding, optimization, approach evaluation
3. **Expert Interview Round** - Live interview with 5+ year senior professional
4. **Verified Profile Badge** - Highlighted with accent styling, shows test scores and feedback

**Core Values Cards:**
- **Integrity First** (Target icon, primary color)
- **Innovation & AI** (Zap icon, accent color)
- **Community & Support** (Users icon, primary color)
- **Trust & Credibility** (Shield icon, accent color)

---

### 5. For Employers Page (ForEmployers.tsx)

**Route:** `/for-employers`

**Purpose:** Marketing page for recruiting companies

**Sections:**

| Section | Content |
|---------|---------|
| **Hero** | Badge "For Hiring Teams", "Hire Verified Talent Faster" headline, two CTAs |
| **Benefits** | 3 cards: 100% Verified Candidates (Shield), Reduce Time-to-Hire by 60% (Clock), AI-Powered Perfect Matches (Target) |
| **Complete Hiring Solution** | 4 feature cards with detailed bullet points |
| **Pricing** | "Free Forever" card with border glow |
| **CTA** | Gradient banner with "Ready to Transform Your Hiring?" |

**Feature Cards Details:**
- **AI Job Description Generator** - Generate JD from title, customize tone, SEO-optimized
- **DNA Matching Technology** - 50+ parameters, skill alignment, culture fit, career trajectory
- **Pre-Verification & Background Checks** - Aptitude results, DSA metrics, expert assessment
- **TA Support & Onboarding** - Dedicated specialist, interview coordination, Day-1 assistance

**Pricing Card Includes:**
- Unlimited job postings
- Access to verified candidate pool
- AI-powered matching & JD generation
- TA support & onboarding help
- Pay only on successful hire

---

### 6. Job Seeker Dashboard (JobSeekerDashboard.tsx)

**Route:** `/dashboard/jobseeker` (Protected - jobseeker role)

**Purpose:** Job seeker's main control panel

**Layout:**
- Sticky header with backdrop blur
- Gradient subtle background

**Components:**

| Component | Description |
|-----------|-------------|
| **Header** | ProvenHire logo (gradient text), "Welcome, {email}", Settings link, Sign Out button |
| **Verification Progress Card** | Progress bar, percentage badge, 3 stage status cards (Aptitude Test, DSA Round, Expert Interview), "Continue Verification Process" button |
| **Stats Grid** | 3 cards - Applications Sent (Briefcase), Interviews (TrendingUp), Profile Views (Eye) |
| **Quick Actions** | 2 cards - Browse Jobs, AI Match Score |
| **Your Applications** | List of applied jobs with status badges |
| **Saved Jobs** | List of bookmarked jobs with View button |

**Data Sources:**
- `job_seeker_profiles` table
- `job_applications` table (with jobs relation)
- `saved_jobs` table (with jobs relation)
- `verification_stages` table

---

### 7. Recruiter Dashboard (RecruiterDashboard.tsx)

**Route:** `/dashboard/recruiter` (Protected - recruiter role)

**Purpose:** Recruiter's main control panel

**Layout:**
- Sticky header with backdrop blur
- Gradient subtle background

**Components:**

| Component | Description |
|-----------|-------------|
| **Header** | "ProvenHire Recruiter" logo, "Welcome, {email}", Settings link, Sign Out button |
| **Stats Grid** | 3 cards - Active Jobs (Briefcase), Total Applicants (Users), Interviews Scheduled (TrendingUp) |
| **Quick Actions Card** | 4 buttons - Post New Job (gradient), View Candidates, Manage Jobs, View Analytics |
| **Recent Job Postings** | List of jobs with posted date, location, status badge, View Details button |

**Data Sources:**
- `jobs` table (filtered by recruiter_id)
- `job_applications` table

---

### 8. Post Job Page (PostJob.tsx)

**Route:** `/post-job` (Protected - recruiter role)

**Purpose:** Form to create new job postings

**Layout:**
- Sticky header with "Back to Dashboard" button
- Centered form card (max-width 3xl)

**Form Fields:**
| Field | Type | Required |
|-------|------|----------|
| Job Title | Text input | Yes |
| Company Name | Text input | Yes |
| Job Description | Textarea (6 rows) | Yes |
| Location | Text input | No |
| Job Type | Select dropdown | No |
| Salary Range | Text input | No |
| Years of Experience | Number input | No |
| Required Skills | Tag input with Add button | No |

**Job Type Options:** Full-time, Part-time, Contract, Internship

**Behavior:**
- Saves to `jobs` table with status 'active' and recruiter_id
- Shows loading state during submission
- Success toast and redirect to recruiter dashboard

---

### 9. Verification Flow (VerificationFlow.tsx)

**Route:** `/verification` (Protected - jobseeker role)

**Purpose:** Multi-stage verification process

**Stage Order:**
1. `profile_setup` - Profile Setup
2. `aptitude_test` - Aptitude Test
3. `dsa_round` - DSA Round
4. `expert_interview` - Expert Interview

**Features:**
- Progress bar showing completion percentage (0-100%)
- 4 stage cards in grid showing status
- Stage icons: CheckCircle (completed - green), Clock (in_progress - yellow), Lock (locked - muted)
- Current stage has primary border and light background
- Renders appropriate stage component based on currentStage

**State Management:**
- Initializes stages in DB on first visit (first stage = in_progress, rest = locked)
- Loads existing progress from `verification_stages` table
- Updates stage status on completion and unlocks next stage
- Sets verification_status to 'verified' when all stages complete

---

### 10. Profile Setup Stage (ProfileSetupStage.tsx)

**Purpose:** First verification stage - profile completion with AI assistance

**Features:**
- Resume upload (PDF, DOC, DOCX - max 5MB)
- AI-powered resume analysis via edge function
- Auto-fill extracted data from resume
- Manual editing of all fields
- Loading states for upload and analysis

**Form Fields (2-column grid for some):**
| Field | Type | Source |
|-------|------|--------|
| Resume | File upload | Required |
| College | Text input | AI-extracted |
| Graduation Year | Number input | AI-extracted |
| Years of Experience | Number input | AI-extracted |
| Phone | Text input | AI-extracted |
| Location | Text input | AI-extracted |
| Professional Bio | Textarea | AI-extracted |
| Skills | Tag input | AI-extracted |
| Actively Looking For Roles | Tag input | AI-extracted |
| Hobbies & Interests | Tag input | AI-extracted |

**Behavior:**
1. User uploads resume → Stored via backend uploads
2. Resume text sent to `analyze-resume` edge function
3. AI extracts structured data and populates form
4. User reviews/edits and submits
5. Profile saved to `job_seeker_profiles`
6. Stage marked complete, next stage unlocked

---

### 11. Aptitude Test Stage (AptitudeTestStage.tsx)

**Purpose:** Second verification stage - aptitude assessment

**Current Status:** Placeholder implementation

**UI:**
- Card with title "Aptitude & CS Fundamentals Test"
- Description about knowledge testing
- Message: "This stage is under development. Click continue to proceed."
- Continue button that calls onComplete

---

### 12. DSA Round Stage (DSARoundStage.tsx)

**Purpose:** Third verification stage - coding challenges

**Current Status:** Placeholder implementation (similar to Aptitude Test)

---

### 13. Expert Interview Stage (ExpertInterviewStage.tsx)

**Purpose:** Fourth and final verification stage - live interview

**Current Status:** Placeholder implementation (similar to Aptitude Test)

---

## Database Schema

### Tables

#### `profiles`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Auth user reference |
| email | TEXT | User email |
| full_name | TEXT | Display name |
| company_name | TEXT | For recruiters |
| phone | TEXT | Contact number |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

#### `user_roles`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Auth user reference |
| role | ENUM | 'recruiter' or 'jobseeker' |
| created_at | TIMESTAMP | Creation time |

#### `job_seeker_profiles`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Auth user reference |
| college | TEXT | Educational institution |
| graduation_year | INTEGER | Year of graduation |
| experience_years | INTEGER | Years of work experience |
| skills | TEXT[] | Array of skills |
| actively_looking_roles | TEXT[] | Desired job roles |
| projects | JSONB | Portfolio projects |
| hobbies | TEXT[] | Interests |
| bio | TEXT | Professional summary |
| phone | TEXT | Contact number |
| location | TEXT | Current location |
| resume_url | TEXT | Link to uploaded resume |
| verification_status | TEXT | Status (pending/in_progress/verified) |
| profile_views | INTEGER | View counter |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

#### `verification_stages`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Auth user reference |
| stage_name | TEXT | Stage identifier |
| status | TEXT | locked/in_progress/completed/failed |
| score | INTEGER | Stage score (if applicable) |
| completed_at | TIMESTAMP | Completion time |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

#### `jobs`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| recruiter_id | UUID | Posting recruiter |
| title | TEXT | Job title |
| company | TEXT | Company name |
| description | TEXT | Job description |
| location | TEXT | Job location |
| job_type | TEXT | Full-time/Part-time/etc |
| salary_range | TEXT | Compensation range |
| experience_required | INTEGER | Min years required |
| required_skills | TEXT[] | Required skill tags |
| status | TEXT | active/closed/draft |
| created_at | TIMESTAMP | Posted date |
| updated_at | TIMESTAMP | Last update |

#### `job_applications`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| job_id | UUID | FK to jobs |
| job_seeker_id | UUID | Applying user |
| resume_url | TEXT | Submitted resume |
| cover_letter | TEXT | Optional cover letter |
| status | TEXT | applied/reviewing/interview_scheduled/rejected/hired |
| applied_at | TIMESTAMP | Application date |
| updated_at | TIMESTAMP | Last update |

#### `saved_jobs`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Saving user |
| job_id | UUID | FK to jobs |
| saved_at | TIMESTAMP | Bookmark date |

### Database Functions

| Function | Purpose |
|----------|---------|
| `get_user_role(user_id)` | Returns user's role |
| `has_role(_role, _user_id)` | Checks if user has specific role |
| `is_jobseeker(_user_id)` | Returns true if jobseeker |
| `is_recruiter(_user_id)` | Returns true if recruiter |

---

## User Flows

### Job Seeker Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      LANDING PAGE (/)                       │
│  "I'm Looking for a Job" button                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   AUTHENTICATION (/auth)                    │
│  1. Select "Job Seeker" role                               │
│  2. Fill signup form (name, email, password)               │
│  3. Submit → Auto-login                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               JOB SEEKER DASHBOARD (/dashboard/jobseeker)   │
│  - View verification progress                              │
│  - Click "Continue Verification Process"                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               VERIFICATION FLOW (/verification)             │
│                                                             │
│  Stage 1: PROFILE SETUP                                    │
│  ├─ Upload resume (PDF/DOC)                                │
│  ├─ AI analyzes and extracts data                          │
│  ├─ Review/edit extracted info                             │
│  └─ Save → Advance to Stage 2                              │
│                                                             │
│  Stage 2: APTITUDE TEST (placeholder)                      │
│  └─ Click Continue → Advance to Stage 3                    │
│                                                             │
│  Stage 3: DSA ROUND (placeholder)                          │
│  └─ Click Continue → Advance to Stage 4                    │
│                                                             │
│  Stage 4: EXPERT INTERVIEW (placeholder)                   │
│  └─ Click Continue → VERIFIED! ✓                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     BROWSE JOBS (/jobs)                     │
│  - Search jobs by title, company, skills                   │
│  - Save interesting jobs                                   │
│  - Apply with resume                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    TRACK APPLICATIONS                       │
│  - View status in dashboard                                │
│  - See saved jobs                                          │
│  - Monitor profile views                                   │
└─────────────────────────────────────────────────────────────┘
```

### Recruiter Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      LANDING PAGE (/)                       │
│  "I'm Looking for Talent" button                           │
│           OR                                                │
│                 FOR EMPLOYERS (/for-employers)              │
│  "Post Your First Job Free" button                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   AUTHENTICATION (/auth)                    │
│  1. Select "Recruiter" role                                │
│  2. Fill signup form (name, email, password)               │
│  3. Submit → Auto-login                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              RECRUITER DASHBOARD (/dashboard/recruiter)     │
│  - View stats (Active Jobs, Applicants, Interviews)        │
│  - Click "Post New Job"                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    POST JOB (/post-job)                     │
│  1. Enter job title, company, description                  │
│  2. Add location, job type, salary                         │
│  3. Add required skills (tags)                             │
│  4. Submit → Job published                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   MANAGE APPLICATIONS                       │
│  - View recent job postings                                │
│  - See applicant counts                                    │
│  - Schedule interviews                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Services

### Core API Endpoints

- `/api/auth/*` for register/login/session
- `/api/ai/*` for resume analysis and learning resources
- `/api/interview/*` for structured AI interviews
- `/api/uploads` for file uploads

All AI calls are routed through the backend using the OpenAI SDK and server-side API keys.

---

## Design System

### Color Palette (HSL)

#### Light Mode
| Token | HSL Value | Description |
|-------|-----------|-------------|
| `--primary` | 243 75% 59% | Deep indigo (brand) |
| `--primary-dark` | 243 75% 45% | Darker indigo |
| `--accent` | 189 94% 43% | Bright cyan |
| `--accent-light` | 189 94% 90% | Light cyan |
| `--background` | 0 0% 100% | White |
| `--foreground` | 240 10% 12% | Dark text |
| `--secondary` | 240 5% 96% | Light gray |
| `--muted` | 240 5% 96% | Muted surfaces |
| `--muted-foreground` | 240 4% 46% | Muted text |
| `--destructive` | 0 84% 60% | Error red |
| `--border` | 240 6% 90% | Border color |

#### Dark Mode
| Token | HSL Value | Description |
|-------|-----------|-------------|
| `--primary` | 243 75% 65% | Lighter indigo |
| `--accent` | 189 94% 50% | Brighter cyan |
| `--background` | 240 10% 8% | Near black |
| `--foreground` | 0 0% 98% | White text |
| `--card` | 240 8% 12% | Card surface |

### Gradients

| Name | Value | Usage |
|------|-------|-------|
| `--gradient-hero` | `linear-gradient(135deg, hsl(243 75% 59%) 0%, hsl(252 83% 67%) 50%, hsl(189 94% 43%) 100%)` | Hero sections, primary buttons, icons |
| `--gradient-subtle` | `linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(240 5% 98%) 100%)` | Page backgrounds |

### Shadows

| Name | Value | Usage |
|------|-------|-------|
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1)` | Card elevation |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | Prominent elements |
| `--shadow-glow` | `0 0 40px hsl(243 75% 59% / 0.2)` | Primary color glow |

### Typography

| Element | Styling |
|---------|---------|
| Hero Title | `text-5xl md:text-7xl font-bold` |
| Section Title | `text-4xl font-bold` |
| Card Title | `text-xl font-semibold` |
| Body | Default Tailwind (1rem) |
| Muted | `text-muted-foreground` |

### Key UI Patterns

**Card Styling:**
```tsx
<Card className="border-2 hover:border-primary/50 transition-all hover:shadow-lg">
```

**Primary Button:**
```tsx
<Button className="bg-gradient-hero hover:opacity-90 transition-opacity shadow-glow">
```

**Icon Container:**
```tsx
<div className="w-16 h-16 bg-gradient-hero rounded-xl flex items-center justify-center shadow-glow">
  <Icon className="h-8 w-8 text-white" />
</div>
```

**Gradient Text:**
```tsx
<span className="bg-gradient-hero bg-clip-text text-transparent">Text</span>
```

**Badge with Icon:**
```tsx
<Badge className="bg-accent/10 text-accent border-accent/20 hover:bg-accent/20">
  <Sparkles className="mr-1 h-3 w-3" />
  Label
</Badge>
```

### Animations

| Name | Description |
|------|-------------|
| `animate-fade-in` | Fade in with slight Y translation |
| `animate-slide-up` | Slide up entrance |
| `animate-scale-in` | Scale in from 95% |
| `hover-scale` | Scale on hover |

### Border Radius

| Token | Value |
|-------|-------|
| `--radius` | 0.75rem (12px) |

---

## Components Reference

### Global Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Navbar` | `src/components/Navbar.tsx` | Global navigation (Logo, Find Jobs, For Employers, About, Sign In, Get Started) |
| `Footer` | `src/components/Footer.tsx` | 4-column footer (Brand, For Job Seekers, For Employers, Contact) |
| `ProtectedRoute` | `src/components/ProtectedRoute.tsx` | Auth guard with role checking |

### UI Components (shadcn/ui)

All standard shadcn/ui components available in `src/components/ui/`:
- Button, Card, Badge, Input, Textarea, Select
- Dialog, Tabs, Progress, Separator
- Toast, Sonner for notifications
- Form components with React Hook Form integration

---

## Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Default | < 768px | Single column, stacked layouts |
| `md:` | ≥ 768px | 2-column grids, side-by-side elements |
| `lg:` | ≥ 1024px | 3-4 column grids, full layouts |

---

## Security Features

- Row Level Security (RLS) on all user data tables
- Protected routes using `ProtectedRoute` component
- Role-based access control (recruiter vs jobseeker)
- Secure file storage for resumes via backend uploads
- Auto-confirm email signups enabled

---

## File Storage

| Bucket | Purpose |
|--------|---------|
| `resumes` | User resume uploads (PDF, DOC, DOCX) |

---

*Documentation Generated: January 2026*
*ProvenHire Version: 1.0*
