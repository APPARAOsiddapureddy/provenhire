# Skill Validity & Expiry System — Setup

## Overview

Skill verifications (Aptitude, Live Coding, AI Interview) expire after a fixed duration. Candidates must re-attempt after expiry to maintain verified status.

| Skill | Display Name | Validity |
|-------|--------------|----------|
| APTITUDE | Aptitude Verification | 180 days |
| LIVE_CODING | Live Coding Verification | 30 days |
| INTERVIEW | AI Interview Verification | 365 days |

## Deployment Steps

### 1. Run Migration

The migration `20260313000000_add_candidate_skill_verifications` is applied automatically when you deploy (via `npm run deploy:migrate` in the build command).

### 2. Backfill Existing Data (One-time)

After deploying, run the backfill script to populate `CandidateSkillVerification` from existing `AptitudeTestResult`, `DsaRoundResult`, and `Interview` records:

```bash
cd server
npm run seed:skill-verifications
```

Or on Render: add a one-time job or run it manually via Render Shell.

### 3. Configure Cron for Expiry

The daily expiry job runs at `POST /api/cron/expire-skills`. Set `CRON_SECRET` in Render Environment Variables, then configure an external cron:

**Option A: cron-job.org**
1. Create account at [cron-job.org](https://cron-job.org)
2. New cron job → URL: `https://YOUR-RENDER-URL.onrender.com/api/cron/expire-skills`
3. Method: POST
4. Add header or query: `?secret=YOUR_CRON_SECRET` or `x-cron-secret: YOUR_CRON_SECRET`
5. Schedule: Daily at 00:00 UTC

**Option B: UptimeRobot / Custom**
- POST to the same URL with the secret in `?secret=` or `x-cron-secret` header.

### 4. Environment Variables

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Required for `/api/cron/expire-skills` (generate with `openssl rand -hex 32`) |

## API

- **GET /api/verification/skills** (auth required) — Returns `{ aptitude, live_coding, interview }` with `status`, `completed_at`, `expires_at`, `days_until_expiry`.

## Re-attempt Block

Candidates cannot start a new attempt while a skill is ACTIVE. They will see:
- "Your Aptitude Verification is still valid. You can re-attempt only after it expires."
- Same for Live Coding and AI Interview.

## Naming

- Recruiters see **Live Coding Verification** (not "DSA Test") for better trust.
