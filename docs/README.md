# ProvenHire — Documentation hub

**Last updated:** April 2026  

Single entry point for engineers, product, and ops. **All product requirements** live in **`[PRD.md](PRD.md)`** (one file: candidate platform, recruiter, business rules, AI Expert Interview full spec). Runbooks live under **Operations**.

**Recent implementation notes:** [IMPLEMENTATION_CHANGELOG.md](IMPLEMENTATION_CHANGELOG.md)

---

## Product requirements

| Document | Scope |
|----------|--------|
| [**PRD.md**](PRD.md) | **Only PRD** — **Part A:** roles, routes, verification (legacy + v2, fresher-until-profile-setup), scoring, DSA, human expert. **Part B:** recruiter. **Part C:** revenue, retakes, recruiter tiers, backlog. **Part D:** AI Expert Interview (full adversarial / voice / APIs / §16). |

Use the TOC at the top of `PRD.md` or GitHub’s outline to jump to Part B/C/D.

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
| Apr 2026 | **Single PRD:** merged `PRD_RECRUITER.md`, `PRD_BUSINESS.md`, `PRD_AI_INTERVIEW.md` into **`PRD.md`**. Removed redundant **`DEPLOYMENT.md`** (use **`DEPLOYMENT_COMPLETE.md`** only). |
| Apr 2026 | Earlier: four separate PRD files; scoring, DSA, pipeline v2 consolidated into candidate section. |
