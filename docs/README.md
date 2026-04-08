# ProvenHire — Documentation for the team

**Last updated:** April 2026  

Use this page as the **single entry point** when onboarding engineers, product, or design. Source of truth for product behavior is the PRD set below; operational runbooks are under **Deployment & local setup**.

**What changed in code recently (wordmark, job seeker dashboard, auth, verification UI, routes):** [IMPLEMENTATION_CHANGELOG.md](IMPLEMENTATION_CHANGELOG.md)

---

## Product requirements (PRDs)

| Document | What it covers |
|----------|----------------|
| [**PRD.md**](PRD.md) | **Main PRD** — roles, verification pipeline (technical + non‑technical), AI interview summary, routes, **test credentials**, NFRs. Start here. |
| [**PRD_PRODUCT_REQUIREMENTS.md**](PRD_PRODUCT_REQUIREMENTS.md) | Ideology, certification levels (L0–L3), progressive access, user journeys. |
| [**PRD_AI_INTERVIEW_MASTER.md**](PRD_AI_INTERVIEW_MASTER.md) | AI Expert Interview — concise master spec (placement, stack, APIs); links to the long PRD. |
| [**PRD_AI_INTERVIEW_ROUND.md**](PRD_AI_INTERVIEW_ROUND.md) | AI Expert Interview — full spec, voice, proctoring, APIs, gaps vs code. |
| [**PRD_RECRUITER.md**](PRD_RECRUITER.md) | Recruiter flows: verification, jobs, Kanban, search, usage — API- and UI-level detail. |
| [**PRD_REVENUE_AND_BUSINESS_RULES.md**](PRD_REVENUE_AND_BUSINESS_RULES.md) | **PRD 4** — candidate retakes, recruiter tiers, limits, progressive reveal, admin/manual payment hooks. |
| [**PRD_VERIFICATION_PIPELINE_V2.md**](PRD_VERIFICATION_PIPELINE_V2.md) | Technical verification track redesign (fresher vs mid/senior stages, env flag). |
| [**PRD_EXPERT_INTERVIEWER.md**](PRD_EXPERT_INTERVIEWER.md) | Expert interviewer (Stage 5): profile gate, slots, evaluations, earnings, cron. |
| [**PRD_VERIFICATION_SCORING.md**](PRD_VERIFICATION_SCORING.md) | Scorecards, floors, shortlist math (Stages 2–4 blend). |
| [**PRD_DSA_QUESTIONS_STORAGE.md**](PRD_DSA_QUESTIONS_STORAGE.md) | DSA question bank and storage model. |
| [**PRD_TECHNICAL_IMPLEMENTATION_REMAINING.md**](PRD_TECHNICAL_IMPLEMENTATION_REMAINING.md) | **Engineering backlog** — AI Skills, System Design, ProvenHire Resume, paywall UI, JD interview, discovery grid; **do-not-touch** list; strict step order. |

Supporting / historical / audits:

| Document | Notes |
|----------|--------|
| [VERIFICATION_IDEOLOGY.md](VERIFICATION_IDEOLOGY.md) | Philosophy of verification. |
| [AI_INTERVIEW_GAP_ANALYSIS.md](AI_INTERVIEW_GAP_ANALYSIS.md) | Gap analysis (may lag current code). |
| [AUDIT_VERIFICATION_SCORING.md](AUDIT_VERIFICATION_SCORING.md) | Scoring audit notes. |
| [FULL_AUDIT_REPORT.md](FULL_AUDIT_REPORT.md) | Broad product/tech audit. |
| [DATA_MIGRATION.md](DATA_MIGRATION.md) | Data migration runbook. |
| [GOOGLE_AUTH_SETUP.md](GOOGLE_AUTH_SETUP.md) | Firebase / Google OAuth. |
| [POSTGRES_SETUP.md](POSTGRES_SETUP.md) | Postgres setup. |
| [SKILL_VALIDITY_SETUP.md](SKILL_VALIDITY_SETUP.md) | Skill expiry cron. |

---

## Engineering & operations

| Document | What it covers |
|----------|----------------|
| [**DEPLOYMENT_COMPLETE.md**](DEPLOYMENT_COMPLETE.md) | Vercel + Render + Postgres, env vars, troubleshooting, **production seeding**. |
| [**DEPLOYMENT.md**](DEPLOYMENT.md) | Additional deployment notes. |
| [**DOMAIN_SETUP.md**](DOMAIN_SETUP.md) | Custom domain (e.g. `provenhire.in` / Vercel). |
| [**SEO.md**](SEO.md) | Meta tags, canonical (**apex**), sitemap, robots, favicons, Search Console. |
| **`src/data/seoArchitecture.ts`** | **Programmatic + money-page SEO** — paths, titles, copy, related links (keep in sync with `public/sitemap.xml`). |
| [**LOCAL_SETUP_STEPS.md**](LOCAL_SETUP_STEPS.md) | Local dev checklist. |
| [**GOOGLE_AUTH_SETUP.md**](GOOGLE_AUTH_SETUP.md) | Firebase / Google sign-in. |
| [**POSTGRES_SETUP.md**](POSTGRES_SETUP.md) | Database setup. |
| [PRODUCT_ARCHITECTURE.md](PRODUCT_ARCHITECTURE.md) | High-level system diagram and modules. |
| [SKILL_VALIDITY_SETUP.md](SKILL_VALIDITY_SETUP.md) | Skill expiry / cron. |

---

## Repo root

| Document | What it covers |
|----------|----------------|
| [../README.md](../README.md) | Quick start, stack, `server/.env` basics. |
| [../DOCUMENTATION.md](../DOCUMENTATION.md) | Long-form UI/page walkthrough (may lag; cross-check **PRD.md**). |

---

## Canonical production URL

- **User-facing site:** `https://provenhire.in` (apex).  
- **`www.provenhire.in`** redirects to apex (see `index.html` inline script).  
- SEO canonicals and sitemap use **apex** unless you intentionally standardize on `www` everywhere (would require changing redirect + CORS + meta).

---

## E2E test accounts (after seeding)

Password for seeded QA users (see `server/prisma/seed-*.ts`): **`PhE2E_Apr2026!x7`** (rotate in scripts if needed).

| Role | How to seed |
|------|-------------|
| Job seekers (aptitude / DSA / AI interview stages) | `npx tsx prisma/seed-test-credentials.ts` |
| Expert interviewer | `npx tsx prisma/seed-interviewer.ts` |
| Recruiter | `npx tsx prisma/seed-recruiter.ts` |
| Admin | `npx tsx prisma/seed-admin.ts` (or `SEED_ON_START` path on deploy) |

**Important:** Logins only exist in the database you actually seed (local vs Render must use the **same** `DATABASE_URL` you intend to test). Run `npx prisma migrate deploy` before seeds if the schema is behind.

---

## Changelog (docs + implementation index)

| When | Change |
|------|--------|
| Apr 2026 | **Implementation changelog** added: [IMPLEMENTATION_CHANGELOG.md](IMPLEMENTATION_CHANGELOG.md) (brand wordmark, dashboard `stage_order`, auth copy, verification components, route pointers). |
| Apr 2026 | PRD set expanded: **PRD 4** revenue ([PRD_REVENUE_AND_BUSINESS_RULES.md](PRD_REVENUE_AND_BUSINESS_RULES.md)), pipeline v2 cross-links, recruiter tier docs refresh, `PRD.md` v6.4. |
| Apr 2026 | Added this index; aligned PRD test credentials; refreshed SEO + deployment seeding notes. |
