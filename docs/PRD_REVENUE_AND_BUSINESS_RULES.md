# PRD 4 — Revenue Model and Business Rules

**ProvenHire v2.0 · Decisions locked · April 2026**

**Implementation index:** `server/src/constants/revenue.ts` · `server/src/services/candidateRetake.service.ts` · `server/src/services/verificationStageRetakeGate.service.ts` · `server/src/utils/recruiterSubscription.ts` · `server/src/services/recruiterUsagePeriod.service.ts` · migrations through `20260411160000_revenue_prd4_usage_retakes`.

**Related:** [PRD_RECRUITER.md](PRD_RECRUITER.md) §9 · [README.md](README.md)

---

## 1. Two revenue streams

| Stream | Who pays | Model |
|--------|----------|--------|
| **1** | Candidates | First AI interview attempt free; **retakes** paid (selected stages). |
| **2** | Recruiters | **Monthly subscription** (discovery limits) + **per-use** (extra JD AI interviews, human expert interviews). |

Streams are independent.

---

## 2. Candidate revenue

### Pricing

| Item | Price |
|------|------|
| First AI interview attempt (any paid-track type) | Free |
| Single retake | ₹399 |
| Two-retake bundle | ₹649 (save ₹149) |

### Paid vs free retakes (by stage)

| Stage | Retake |
|-------|--------|
| CS Fundamentals | Free |
| DSA Round | Free |
| AI Skills Interview | Paid (₹399 / bundle) |
| System Design Interview | Paid |
| AI Expert Interview (`expert_interview` / `ai_expert`) | Paid |

### Cooldowns (server-enforced)

| Stage | After attempt |
|-------|----------------|
| CS Fundamentals | 24 h |
| DSA Round | 48 h |
| AI Skills / System Design | 7 days |
| AI Expert | 30 days |

### Retake bundle

- ₹649 = **2** ledger credits; each credit consumed when a **paid** retake **starts** (see `CandidateRetakeLedger`).
- Unused credits expire **90 days** from purchase (`CANDIDATE_RETAKE_CREDIT_VALIDITY_DAYS`).

### Skill / verification validity (product truth; expiry UX may ship incrementally)

| Stage | Validity (days) |
|-------|------------------|
| CS Fundamentals | 180 |
| DSA | 90 |
| AI Skills | 180 |
| System Design | 180 |
| AI Expert | 365 |

### Admin (manual UPI until Razorpay)

- Grant credits: `POST /api/admin/users/:id/grant-retake` body `{ "packageType": "single" | "bundle" }`.

---

## 3. Recruiter revenue

### Subscription tiers

| Tier | Price (INR/mo) | Active jobs | Profile views/mo | Contacts/mo | JD interviews/mo | Analytics |
|------|----------------|------------|------------------|-------------|------------------|-----------|
| Free | 0 | 2 | 5 | 0 | 0 | No |
| Starter | 2,999 | 5 | 50 | 10 | 5 | No |
| Growth | 7,999 | Unlimited | Unlimited | 30 | 10 | Yes |

**Profile view:** one credit per first **full** ProvenHire Resume open per recruiter–candidate pair (grid browse does not consume).

**Contacts:** each **Express Interest** (`POST /api/notifications/contact-candidate`) uses one credit (free tier =  **0** → upgrade required).

**JD interviews:** included credits do **not** roll over; overage billed per session when product flow is wired (`jdInterviewCountMonth`).

**Monthly reset:** usage counters align to **calendar month** (UTC month start); see `recruiterUsagePeriod.service.ts`.

### Per-use (recruiter)

| Item | Price | Note |
|------|------|------|
| JD AI interview (beyond plan) | ₹799 / session | When flow charges overage |
| Human expert interview | ₹2,500 / session | Recruiter-paid add-on |

### Admin (manual UPI until Razorpay)

- Set plan: `PATCH /api/admin/recruiters/:id/plan` body `{ "subscriptionTier": "free" | "starter" | "growth" }` (`:id` = **recruiter profile id**).

### Recruiter usage API ( implemented )

- `GET /api/users/me/recruiter-subscription` — tier, limits, MTD `used` counters, `periodStart`.

---

## 4. Expert interviewer compensation

| Phase | INR / session | Notes |
|-------|---------------|--------|
| Founding (first ~15) | 750 | |
| Standard | 1,500 | |
| Premium niche | 2,000 | ML, blockchain, embedded, etc. |

Recruiter pays ₹2,500 / human expert session (standard economics); payout process: manual UPI weekly until automated payouts.

**Careers copy:** see main PRD §4 / product marketing; founding program emphasizes ₹750 / session and monthly earning range.

---

## 5. Progressive reveal (recruiter ↔ candidate)

Design intent: reduce off-platform hiring after light contact.

| Step | Recruiter sees |
|------|----------------|
| 9-profile (or search) grid | Badge, score, role, top verified skills |
| Full resume (1 view credit) | Full ProvenHire Resume — **no** contact details |
| After interest accepted | Name, email, LinkedIn |
| After first interview completed | Phone (last) |

---

## 6. Parked (not in scope)

- Razorpay — after ~₹50k manual payments
- Success fees — after ~200 recorded hires
- Enterprise / annual plans — when demand is proven

---

## 7. Metrics (targets)

See original PRD 4 stakeholder doc: first-attempt completion, retake purchase rate, free→starter conversion, JD interview usage, churn, etc.

---

*Canonical business rules for engineering; cross-check enums and limits in `recruiterSubscription.ts` and `revenue.ts`.*
