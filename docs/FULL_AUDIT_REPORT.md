# ProvenHire – Full Technical & Product Audit Report

**Date:** March 2025  
**Scope:** Codebase review, functional flows, bugs, code quality, SEO, performance, security, UX.

---

## 1. Architecture Overview

### 1.1 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite 5, React Router 7, TanStack Query, Jotai, Tailwind CSS, Radix UI (shadcn/ui), React Hook Form + Zod |
| **Backend** | Node.js, Express, Prisma ORM, PostgreSQL |
| **Auth** | JWT (access + refresh), Firebase (Google SSO), email OTP (Resend/Gmail) |
| **Real-time** | Socket.io (proctoring alerts), Daily.co (video interviews) |
| **AI / Proctoring** | Python FastAPI (ai-proctor), face-api.js, Monaco Editor, pdfjs-dist |
| **Deploy** | Vercel (frontend + rewrites), Render (backend API) |

### 1.2 Folder Structure

```
provenhire/
├── src/                    # Frontend
│   ├── components/         # UI, dashboard, verification, admin, settings
│   ├── contexts/           # AuthContext
│   ├── data/               # Static questions (aptitude, DSA), roles
│   ├── hooks/              # useSoundDetection, useVerificationGate, useProctorFrameCapture, etc.
│   ├── lib/                # api.ts, config, firebase, shortlisting
│   ├── pages/              # Index, Auth, Jobs, About, ForEmployers, dashboard/*, verification/*, admin/*, interview/*
│   ├── utils/              # recordingUpload, etc.
│   └── App.tsx
├── server/                 # Backend
│   ├── prisma/             # Schema, migrations, seeds
│   ├── src/
│   │   ├── routes/         # auth, jobs, verification, users, proctoring, admin, cron, etc.
│   │   ├── middleware/     # auth (requireAuth, requireAdmin, requireExpertInterviewer)
│   │   ├── services/       # daily, firebase, skillVerification, resend, etc.
│   │   └── app.ts
│   └── package.json
├── ai-proctor/             # Python proctoring service
├── public/                 # favicon, logo, sitemap, robots, og-image
└── docs/                   # PRODUCT_ARCHITECTURE, SEO, DEPLOYMENT, etc.
```

### 1.3 Major Modules and Purpose

| Module | Purpose |
|--------|---------|
| **Auth** | Register, login, Google SSO, role selection, forgot/reset password, JWT refresh, session expiry handling |
| **Jobs** | List/search jobs, apply, save/unsave, recruiter post job, applicants, application status |
| **Verification** | Multi-stage pipeline: profile setup, aptitude, DSA, AI expert interview, human expert interview; non-tech track: assignment + human interview; cooldowns, shortlisting, invalidation |
| **Users** | Job-seeker profile (resume, target title, experience, etc.), recruiter profile, candidate profile view (GET /me/candidate-profile, GET /candidates/:id) |
| **Proctoring** | Frame upload, alerts, read state; Socket.io for real-time alerts |
| **Interview** | AI interview (start, respond), expert sessions (slots, book, evaluate), Daily.co room |
| **Notifications** | Inbox, read, job alerts, contact candidate, admin broadcast, newsletter |
| **Admin** | Stats, job-seekers/recruiters lists, applications, interviewer applications approve/reject, feature flags, export users, delete user |
| **Settings** | Job-seeker, recruiter, interviewer settings (profile, preferences) |
| **Cron** | Expire skills, reminders (7d/3d), emails; protected by CRON_SECRET |

---

## 2. Full Website Functional Testing – Summary

### 2.1 User Flows Verified (Code-Level)

| Flow | Status | Notes |
|------|--------|------|
| Landing (/) | ✅ | Index.tsx, SEO, Navbar, Footer, CTA |
| /login, /signup | ✅ | Redirect to /auth?mode=login|signup |
| Auth (login, signup, Google, forgot, reset) | ✅ | AuthContext + Auth.tsx; reset uses /api/auth/reset-password |
| Logout | ✅ | signOut clears tokens, navigates to / |
| Candidate profile creation | ✅ | ProfileSetupStage, JobSeekerSettings, POST /api/users/job-seeker-profile |
| Skill verification flow | ✅ | VerificationFlow.tsx, stages order by roleType (technical vs non_technical) |
| Resume/profile upload | ✅ | Jobs.tsx apply flow, ProfileSetupStage parse-resume + job-seeker-profile |
| Recruiter/company account | ✅ | RecruiterOnboarding, POST recruiter-profile (companyName, companySize) |
| Job posting | ✅ | PostJob.tsx, POST /api/jobs, optional assignment AI |
| Candidate search | ✅ | CandidateSearch.tsx, GET /api/users/candidates, contact-candidate |
| Hiring flow | ✅ | ApplicantsPage, POST application status, RecruiterDashboard job actions |
| Dashboards (jobseeker, recruiter, expert) | ✅ | ProtectedRoute by role, BackendGate for expert |
| Settings | ✅ | SettingsPage, allowedRoles jobseeker|recruiter|expert_interviewer |
| Notifications | ✅ | NotificationInbox, GET /api/notifications, read |
| Error states | ✅ | api.ts 503/401/500 handling, toasts, circuit breaker |
| Empty states | ✅ | Various “no jobs”, “no applications” messages |

### 2.2 API ↔ Frontend Alignment

- Auth: register, login, google, google/select-role, me, refresh, forgot-password, reset-password, change-password — all used correctly.
- Jobs: GET/POST /api/jobs, apply, save/unsave, me/applications, me/saved, recruiter, applicants — aligned.
- Verification: stages, stages/update, stages/bulk, stages/reset, aptitude, dsa, technical-scorecard, non-tech-assignment/submit, book-slot, human-interview-session, matched-interviewers — aligned.
- Users: job-seeker-profile (GET/POST), recruiter-profile, me/candidate-profile, candidates, candidates/:profileId — aligned.
- Notifications, proctoring, appeals, admin, expert, settings, cron — paths match server routes.

---

## 3. Bugs Found

### 3.1 High / Medium

| # | Bug | Location | Fix |
|---|-----|----------|-----|
| 1 | **Missing favicon.ico** | index.html references `<link rel="icon" href="/favicon.ico" />` but only `favicon.png` and `favicon.svg` exist in public. | Add a favicon.ico (e.g. 32×32) or remove the favicon.ico link from index.html. |
| 2 | **OG image mismatch** | index.html and SEO use `og:image` / `twitter:image` = `https://www.provenhire.in/og-image.png`. Only `og-image.svg` exists in public. | Add `og-image.png` (1200×630) or change meta tags to point to `og-image.svg` (some platforms prefer PNG). |
| 3 | **JobTitleModal silent failure** | On save failure, no toast or error is shown; user only sees “Saving...” then button re-enables. | In `src/components/JobTitleModal.tsx`, in the catch block add: `toast.error(err instanceof Error ? err.message : "Failed to save role");` (use sonner or useToast). |
| 4 | **updatePassword stub** | AuthContext exposes `updatePassword` but it only shows “Password update is not configured yet.” | Either implement POST /api/auth/update-password (if backend supports) or remove from context/UI to avoid confusion. |

### 3.2 Low / Polish

| # | Bug | Location | Fix |
|---|-----|----------|-----|
| 5 | **404 page not themed** | NotFound.tsx uses hardcoded `bg-gray-100`, `text-blue-500` instead of theme tokens. | Use Tailwind theme classes (e.g. `bg-background`, `text-primary`) and add Navbar/Footer for consistency. |
| 6 | **404 no SEO** | NotFound has no SEO component; crawlers may index 404s. | Add `<SEO title="Page Not Found" noIndex />` (or similar) so robots get noindex. |
| 7 | **AptitudeTestStage raw fetch** | Uses `fetch(\`/api/health?...\`)` instead of `api.get()` so it bypasses auth header and circuit breaker. | Use `api.get("/api/health")` for consistency (or keep fetch but document why). |
| 8 | **Apply error message** | Jobs.tsx uses `error?.response?.data?.error`; api.ts attaches `err.response = { data: errorBody }`. Server returns `error` key — correct. | No change needed; optional: centralize error message extraction in api or a small helper. |

### 3.3 Sitemap / SEO

- **Verification in sitemap** | `/verification` is in sitemap but is behind auth; users hitting it will redirect to login. Acceptable for discovery; consider lowering priority or leaving as-is.
- **Google Search Console** | index.html has placeholder `ADD_VERIFICATION_CODE`; replace with real verification meta when verified.

---

## 4. Security Audit

### 4.1 Positive Findings

- **Auth:** JWT + refresh, tokens in localStorage; 401 triggers refresh then session_expired and redirect. Admin and expert routes use requireAdmin / requireExpertInterviewer.
- **Cron:** `/api/cron/expire-skills` protected by CRON_SECRET (query or header).
- **HTML output:** NotificationInbox and BroadcastMessageDialog use DOMPurify before dangerouslySetInnerHTML; allowed tags restricted.
- **Job description:** Rendered as plain text in JobDetailsDialog (no HTML), so no XSS from that field.
- **CORS:** Server allows specific origins (www, bare domain, Vercel, localhost); credentials not sent cross-origin for API.
- **Helmet:** Used with contentSecurityPolicy disabled (for flexibility); crossOriginOpenerPolicy set for popups (Google sign-in).

### 4.2 Recommendations

| # | Issue | Recommendation |
|---|--------|----------------|
| 1 | **CORS** | app.ts uses both custom CORS middleware and `cors({ origin: (o, cb) => cb(null, true) })`; second one effectively allows any origin. Prefer single source of truth (e.g. only the custom middleware with allowlist). |
| 2 | **Rate limiting** | No rate limiting on auth (login, register, forgot-password) or on apply/save. Add rate limiting (e.g. express-rate-limit) for auth and sensitive POSTs. |
| 3 | **Input validation** | Server uses Zod in many routes (auth, users, jobs); ensure all user-controlled inputs (especially file uploads, assignment text) are validated and length-limited. |
| 4 | **Proctor frame upload** | Proctor frame endpoint accepts base64; enforce size limit and consider abuse (e.g. per-session caps). |

---

## 5. SEO Review

### 5.1 Current State

- **index.html:** Title, description, keywords, canonical (www), favicon, OG and Twitter tags, JSON-LD (Organization, WebSite). Preconnect for fonts.
- **SEO.tsx:** Per-page title, description, canonical, robots (index/noindex), og:title, og:description, og:url. Used on Index, Auth, Jobs, About, ForEmployers.
- **robots.txt:** Allow all, Sitemap URL.
- **sitemap.xml:** Home, auth, login, signup, jobs, for-employers, verification, about, careers/interviewer; changefreq and priority set.

### 5.2 Gaps and Fixes

| # | Item | Fix |
|---|------|-----|
| 1 | **OG/Twitter image** | Ensure `og-image.png` exists at 1200×630 and is linked; or use og-image.svg if acceptable. |
| 2 | **ProvenHire keyword** | Already in title and description; add in one H1/H2 on Index (e.g. “Why ProvenHire” section). |
| 3 | **Structured data** | Add WebApplication or JobPosting schema for /jobs if you want rich results. |
| 4 | **Page-specific JSON-LD** | For /jobs consider JobPosting list; for /for-employers consider FAQPage if you have FAQs. |
| 5 | **Missing SEO on some pages** | Dashboard and verification are behind auth; no need for public SEO. NotFound should set noindex (see Bugs). |
| 6 | **Canonical** | SEO component builds canonical from path; ensure all public pages pass correct path so canonical stays https://www.provenhire.in/... |

---

## 6. Performance Audit

### 6.1 Build Output (Vite)

- **Large chunks:** `VerificationFlow-BL8NaBrq.js` ~837 KB, `index-BIib3w-d.js` ~970 KB (minified). Vite warns chunks > 500 KB.
- **AdminDashboard** ~775 KB.

### 6.2 Recommendations

| # | Improvement | Action |
|---|-------------|--------|
| 1 | **Code splitting** | Split VerificationFlow by stage (e.g. lazy load AptitudeTestStage, DSARoundStage, ExpertInterviewStage, HumanExpertInterviewStage, NonTechnicalAssignmentStage). Already using lazy() for PostJob, CandidateSearch, etc.; extend to heavy verification stage components. |
| 2 | **Manual chunks** | In vite.config.ts use build.rollupOptions.output.manualChunks to isolate react, react-dom, @daily-co/daily-react, monaco, recharts, pdfjs-dist into separate chunks so they cache across routes. |
| 3 | **Images** | Favicon/logo/og-image: ensure appropriate dimensions; use WebP where supported. |
| 4 | **Lazy loading** | Dashboard tabs (Applications, Saved, Resume, etc.) could lazy load content on first tab switch to reduce initial JS. |
| 5 | **Caching** | vercel.json already sets Cache-Control for /assets and static assets; keep long max-age for hashed assets. |
| 6 | **Core Web Vitals** | Measure LCP (hero, main content), FID/INP, CLS (images, fonts). Consider font-display: swap and preload for critical font. |

---

## 7. Code Quality Review

### 7.1 Good Practices

- TypeScript throughout; Zod for server validation.
- Protected routes and role-based access centralized in ProtectedRoute and server middleware.
- API client with refresh, circuit breaker for 503, and consistent error shape.
- React Query for some server state; Jotai available for client state.

### 7.2 Improvements

| # | Issue | Suggestion |
|---|--------|------------|
| 1 | **Duplicate stage labels** | VerificationFlow and JobSeekerDashboard (and possibly others) define similar STAGE_LABELS maps. Extract to a shared constant (e.g. `src/constants/verificationStages.ts`). |
| 2 | **Error handling** | Some catch blocks only do `toast.error(error.message)` without checking for Error type or response.data. Use a small helper: `getErrorMessage(err)` returning string. |
| 3 | **any types** | Replace `err: any`, `error: any`, `profile: any` with `unknown` and type guards or typed error interfaces. |
| 4 | **Hardcoded strings** | e.g. “Run npm run dev from the project root” appears in api.ts and AuthContext; move to a single message constant (or env-based) for dev vs prod. |
| 5 | **JobTitleModal** | Dialog `onOpenChange` is no-op; consider calling a parent callback to close when user clicks outside, and show error on save failure (see Bugs). |
| 6 | **DSA questions** | src/data/dsaQuestions.ts contains many “TODO: Implement your solution here” placeholders; these are intentional for candidates. No change unless you want different boilerplate. |

---

## 8. UX / Product Improvements

### 8.1 Candidate Experience

- **Verification progress** | Clear stage names and progress bar; add estimated time per stage (e.g. “~15 min”) where possible.
- **Post-apply** | Already redirecting to dashboard Applications tab; consider a small “Application submitted” persistent banner or confirmation copy.
- **Resume tab** | Align job-seeker Resume view with recruiter CandidateProfileView (already using GET /api/users/me/candidate-profile); ensure all fields and formatting match.
- **Empty states** | “No saved jobs”, “No applications” — add primary CTA (e.g. “Browse jobs”) where relevant.

### 8.2 Recruiter Experience

- **Applicants list** | Filter by status, sort by date, search by name/skill.
- **Job template** | Save draft or duplicate existing job to speed up posting.
- **Candidate search** | Filters (verification level, role type, experience) already present; consider “Saved search” or alerts when new matching candidates appear.

### 8.3 Platform Comparisons (LinkedIn / Wellfound / Naukri)

- **Messaging** | No in-app messaging between recruiter and candidate; “Contact candidate” sends notification. Consider a simple message thread or email link.
- **Company pages** | No dedicated company profile page; only company name on jobs. Optional: company logo, description, jobs list.
- **Salary visibility** | Job has salary_range; consider “Salary insights” or range by role for candidates.
- **Recommendations** | No endorsements or recommendations; fits “verified skills” model; could add “Recommended by expert” badge.
- **Job alerts** | Job alert settings exist; ensure email content and frequency are clear and configurable.
- **Mobile** | Responsive layout; ensure verification (camera, timer, code editor) works well on mobile or show “Use desktop” message for heavy stages.

---

## 9. Final Summary

### 9.1 Architecture

- Clear separation: Vite SPA + Express API + Prisma + optional Python proctor. Auth, jobs, verification, proctoring, admin, and settings are well-modularized. Domain (www) and API rewrites configured.

### 9.2 Bugs to Fix First

1. Add or remove favicon.ico reference.  
2. Fix og-image (add og-image.png or point to .svg).  
3. JobTitleModal: show error toast on save failure.  
4. updatePassword: implement or remove from UX.  
5. NotFound: theme + noindex SEO.

### 9.3 Security

- Auth and role checks in place; cron protected. Tighten CORS to single allowlist and add rate limiting on auth and critical POSTs.

### 9.4 SEO

- Meta, OG, canonical, JSON-LD, sitemap, robots in good shape. Fix og-image asset; add noindex for 404; consider more structured data for /jobs.

### 9.5 Performance

- Reduce chunk size via lazy loading of verification stages and manual chunks for large deps (react, monaco, daily, recharts).

### 9.6 Code Quality

- Centralize stage labels and error messages; replace `any` with typed errors; reduce duplication.

### 9.7 UX

- Clear verification progress and empty-state CTAs; recruiter filters and job drafts; optional messaging and company pages for parity with other hiring platforms.

---

*End of audit report.*
