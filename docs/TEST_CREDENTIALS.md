# ProvenHire — test credentials & QA matrix

Use these accounts on **staging** or **local** only. Apply DB migrations, then seed.

## One shared password (job seeker E2E seeds)

| Field | Value |
|--------|--------|
| **Password** | `PhE2E_Apr2026!x7` |

All accounts created by `server/prisma/seed-test-credentials.ts` use this password unless noted.

---

## How to create / refresh accounts

From the **server** directory (with `DATABASE_URL` set):

```bash
cd server
npx prisma migrate deploy
npx tsx prisma/seed-test-credentials.ts
```

Or: `npm run seed:test-credentials`

**Recruiter, interviewer (expert), admin** are separate scripts:

```bash
npm run seed:recruiter
npm run seed:interviewer
npm run seed:admin
```

Main `prisma db seed` runs DSA/data seeds + recruiter + interviewer + skill verifications — it does **not** run `seed-test-credentials` by default (optional on Render via `SEED_ON_START`).

---

## 1. Job seekers — AI interviews (what to verify)

Assume **Verification Pipeline v2** is on (default): `VERIFICATION_PIPELINE_V2` unset or `true`.

### A. DSA round + AI Skills (“DSA + skill checkup”)

These map to the **software mid/senior** path: **DSA Round** then **AI Skills Interview**.

| Purpose | Email | Next step after login |
|--------|--------|------------------------|
| **DSA in progress** | `qa.v2.mid.dsa@test.provenhire.com` | Verification → **DSA Round** |
| **AI Skills in progress** (DSA done) | `qa.v2.mid.aiskills@test.provenhire.com` | Verification → **AI Skills Interview** |

**Quick check:** Log in → **Dashboard** → **Continue verification** / **Verification** → you land on the expected stage; start flows call Gemini / services as configured.

### B. System design interview

| Purpose | Email | Next step |
|--------|--------|------------|
| **System design in progress** | `qa.v2.mid.sysdesign@test.provenhire.com` | Verification → **System Design** (after AI Skills completed in seed) |

### C. Overall AI interview (“AI Expert”)

| Purpose | Email | Next step |
|--------|--------|------------|
| **Expert interview in progress (v2 path)** | `qa.v2.mid.expert@test.provenhire.com` | Verification → **Expert Interview** |
| **Legacy path** (aptitude → DSA → expert, no AI Skills in seed) | `qa.ai.apr2026@test.provenhire.com` | Same role; older stage layout |

### D. Paywall (retake / credits)

| Purpose | Email | What to verify |
|--------|--------|----------------|
| **AI Skills retake → paywall** | `qa.v2.paywall.retake@test.provenhire.com` | AI Skills marked **completed** + a **completed** `ai_skills` interview row **10 days ago** (cooldown cleared) + **no** retake credits. Open **Verification**, start **AI Skills** again → expect **PaywallModal** (`PAYMENT_REQUIRED` or credit message). |

---

## 2. Recruiter dashboard

| Field | Value |
|--------|--------|
| **Email** | `qa.recruiter.apr2026@test.provenhire.com` |
| **Password** | `PhE2E_Apr2026!x7` |
| **Script** | `npm run seed:recruiter` |

**Check:** `/auth` → **Recruiter** → sign in → `/dashboard/recruiter` — company profile, job posts, candidate views (if jobs/candidates exist).

---

## 3. Expert interviewer dashboard

| Field | Value |
|--------|--------|
| **Email** | `qa.expert.apr2026@test.provenhire.com` |
| **Password** | `PhE2E_Apr2026!x7` |
| **Script** | `npm run seed:interviewer` |

**Check:** `/auth` → sign in → `/dashboard/expert` — interviewer profile and slots (as implemented).

---

## 4. Admin

| Field | Value |
|--------|--------|
| **Email** | `admin@test.provenhire.com` |
| **Password** | `Admin123456` |
| **Script** | `npm run seed:admin` |

**Check:** `/admin` — admin dashboard, queues, approvals (e.g. AI interview queue).

---

## 5. Optional: flow-audit HTTP users

`server/scripts/createTestUsers.ts` registers **tech-fresher / tech-mid / tech-senior** (and non-tech tiers) via **local API** with password `TestFlow@2026` when the server is up (`AUDIT_API_BASE`, default `http://127.0.0.1:10000`). Used for automated audits, not the same as Prisma seeds above.

---

## 6. Cleanup before production

```bash
cd server && npx tsx prisma/clear-test-users.ts
```

Removes job seeker / recruiter / expert users (not admins). Run before go-live on a DB that had test seeds.

---

## Reference: scripts

| Script | Command |
|--------|---------|
| Job seeker E2E (this doc, shared password) | `npm run seed:test-credentials` |
| Recruiter | `npm run seed:recruiter` |
| Expert interviewer | `npm run seed:interviewer` |
| Admin | `npm run seed:admin` |
| AI interview shortcut (older expert-only path) | `npm run seed:ai-interview` |
