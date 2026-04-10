# ProvenHire — Documentation hub

**Last updated:** April 2026  

Single entry point for engineers, product, and ops. **Product requirements** start at **`[PRD.md](PRD.md)`** (index), then split into **[PRD_CANDIDATE.md](PRD_CANDIDATE.md)**, **[PRD_RECRUITER.md](PRD_RECRUITER.md)**, **[PRD_BUSINESS.md](PRD_BUSINESS.md)**, **[PRD_AI_INTERVIEW.md](PRD_AI_INTERVIEW.md)**. Runbooks live under **Operations**.

**Recent implementation notes:** [IMPLEMENTATION_CHANGELOG.md](IMPLEMENTATION_CHANGELOG.md)

---

## Product requirements

| Document | Scope |
|----------|--------|
| [**PRD.md**](PRD.md) | **Index** — links to the four PRD files below. |
| [**PRD_CANDIDATE.md**](PRD_CANDIDATE.md) | Candidate platform: verification (all tracks), scoring, routes, human expert interviewer. |
| [**PRD_RECRUITER.md**](PRD_RECRUITER.md) | Recruiter product. |
| [**PRD_BUSINESS.md**](PRD_BUSINESS.md) | Revenue, retakes, limits, backlog. |
| [**PRD_AI_INTERVIEW.md**](PRD_AI_INTERVIEW.md) | AI Expert Interview (adversarial / voice / APIs / §16). |

Open **only** the file you need; use each file’s heading outline on GitHub or in the editor.

---

## Operations & setup

| Document | Use |
|----------|-----|
| [DEPLOYMENT_COMPLETE.md](DEPLOYMENT_COMPLETE.md) | Vercel + Render + Postgres, env vars, production seeding, troubleshooting |
| [DOMAIN_SETUP.md](DOMAIN_SETUP.md) | Custom domain (e.g. provenhire.in) |
| [LOCAL_SETUP_STEPS.md](LOCAL_SETUP_STEPS.md) | Local dev checklist |
| [POSTGRES_SETUP.md](POSTGRES_SETUP.md) | Database setup |
| [GOOGLE_AUTH_SETUP.md](GOOGLE_AUTH_SETUP.md) | Firebase / Google sign-in |
| [SEO.md](SEO.md) | Meta, canonical, sitemap, Search Console |
| [DATA_MIGRATION.md](DATA_MIGRATION.md) | Migration runbook |
| [SKILL_VALIDITY_SETUP.md](SKILL_VALIDITY_SETUP.md) | Skill expiry / cron |

---

## Repo root

| Document | Use |
|----------|-----|
| [../README.md](../README.md) | Quick start, stack |
| [../DOCUMENTATION.md](../DOCUMENTATION.md) | Short pointer to this hub |

---

## Canonical production URL

- **Site:** `https://provenhire.in` (apex). **`www`** redirects to apex.

---

## E2E test accounts (after seeding)

Password for seeded QA users: **`PhE2E_Apr2026!x7`** (rotate in seeds if needed).

| Role | Seed |
|------|------|
| Job seekers (stages) | `cd server && npx tsx prisma/seed-test-credentials.ts` |
| Expert interviewer | `npx tsx prisma/seed-interviewer.ts` |
| Recruiter | `npx tsx prisma/seed-recruiter.ts` |
| Admin | `npx tsx prisma/seed-admin.ts` |

Run `npx prisma migrate deploy` before seeds if the schema is behind.

---

## Changelog (docs structure)

| When | Change |
|------|--------|
| Apr 2026 | **PRD v6.9:** Split monolith into **PRD_CANDIDATE**, **PRD_RECRUITER**, **PRD_BUSINESS**, **PRD_AI_INTERVIEW**; **`PRD.md`** is index only. Non-tech §3.2 + §3.0 implementation table + pipeline v2 callout; scorecard canonical box; test credentials removed from PRD (see **DEPLOYMENT_COMPLETE**). |
| Apr 2026 | **PRD v6.8:** AI interview deep doc — **§3.4.9** (questions, relevance, Whisper/Cartesia stack, answer flow), **§3.4.3** STT/TTS corrections, Expert **profile-driven `v2/start`**; Part D **§12.0** vs Deepgram **§12.1**. See **`IMPLEMENTATION_CHANGELOG.md`**. |
| Apr 2026 | **Single PRD:** merged `PRD_RECRUITER.md`, `PRD_BUSINESS.md`, `PRD_AI_INTERVIEW.md` into **`PRD.md`**. Removed redundant **`DEPLOYMENT.md`** (use **`DEPLOYMENT_COMPLETE.md`** only). |
| Apr 2026 | Earlier: four separate PRD files; scoring, DSA, pipeline v2 consolidated into candidate section. |
