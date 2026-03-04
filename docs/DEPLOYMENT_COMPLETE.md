# ProvenHire: Complete Vercel + Render Deployment Guide

Step-by-step guide to fix and verify the full deployment flow.

---

## Architecture

```
[User] → Vercel (Frontend) → Render (Backend) → Render Postgres (Database)
```

- **Frontend (Vercel):** React app, calls backend via `VITE_API_URL`
- **Backend (Render):** Express API, CORS allows Vercel origin via `BASE_URL`

---

## Part 1: Push Latest Code to GitHub

1. Ensure all changes are committed and pushed:
   ```bash
   cd /path/to/provenhire
   git status
   git add -A
   git commit -m "Deployment fixes: ping/status endpoints"
   git push origin main
   ```
2. This triggers auto-deploy on both Render and Vercel (if connected to the repo).

---

## Part 2: Render (Backend) Setup

### 2.1 Create/Edit Backend Web Service

1. Go to [render.com](https://render.com) → Dashboard.
2. **New +** → **Web Service** (or edit existing `provenhire-server`).
3. Connect GitHub repo: `APPARAOsiddapureddy/provenhire`.

### 2.2 Build & Start Settings

| Setting | Value |
|---------|-------|
| **Name** | `provenhire-server` |
| **Root Directory** | `server` |
| **Runtime** | Node |
| **Build Command** | `npm install && npx prisma generate && npm run build` |
| **Start Command** | `npx prisma migrate deploy && npm run start` |
| **Instance Type** | Free (or paid) |

### 2.3 Environment Variables (Render)

Add these in **Environment** tab (or use Environment Group):

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | Postgres connection string from Render Postgres | Yes |
| `JWT_SECRET` | Random string (e.g. `openssl rand -hex 32`) | Yes |
| `PORT` | Leave empty (Render sets it) | No |
| `BASE_URL` | Your Vercel URL (e.g. `https://provenhire-xxx.vercel.app`) | Yes (for CORS) |
| `OPENAI_API_KEY` | OpenAI key (optional) | No |
| `GEMINI_API_KEY` | Gemini key (optional) | No |

**Important:** You need a PostgreSQL database. Create one: **New +** → **PostgreSQL**, then copy **Internal Database URL** into `DATABASE_URL`.

### 2.4 Deploy & Verify Backend

1. Click **Deploy** (or wait for auto-deploy from GitHub).
2. Wait for build to finish (check **Logs**).
3. Copy your backend URL: `https://provenhire-server.onrender.com` (or similar).

**Verify endpoints** (open in browser or curl):

```
https://YOUR-RENDER-URL.onrender.com/health
https://YOUR-RENDER-URL.onrender.com/ping
https://YOUR-RENDER-URL.onrender.com/status
```

Expected:
- `/health` → `{"ok":true}`
- `/ping` → `{"ping":"pong","timestamp":"..."}`
- `/status` → `{"status":"running","service":"provenhire-api"}`

If you get **Route not found**: the deployed code is old. Ensure you pushed to GitHub and Render redeployed from the latest commit.

---

## Part 3: Vercel (Frontend) Setup

### 3.1 Create/Edit Frontend Project

1. Go to [vercel.com](https://vercel.com) → Dashboard.
2. **Add New** → **Project** (or edit existing).
3. Import repo: `APPARAOsiddapureddy/provenhire`.

### 3.2 Build Settings

| Setting | Value |
|---------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | `.` (leave default) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### 3.3 Environment Variable (Critical)

1. Go to **Settings** → **Environment Variables**.
2. Add:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://YOUR-RENDER-URL.onrender.com` (your actual Render backend URL)
   - **No trailing slash.**
3. Apply to: Production, Preview, Development.
4. **Save.**

### 3.4 Redeploy (Required)

**Vite bakes `VITE_API_URL` into the build at build time.** Changing the env var does NOT affect existing deployments.

1. Go to **Deployments** tab.
2. Click **⋮** on the latest deployment → **Redeploy**.
3. Wait for the new deployment to complete.

### 3.5 Copy Vercel URL

After deploy, copy your frontend URL: `https://provenhire-xxx.vercel.app`.

---

## Part 4: Connect Backend to Frontend (CORS)

1. Go back to **Render** → your backend service → **Environment**.
2. Set `BASE_URL` = your Vercel URL (e.g. `https://provenhire-xxx.vercel.app`).
3. **Save** and **Redeploy** the backend.

---

## Part 5: End-to-End Verification

### 5.1 Check API is reachable

1. Open: `https://YOUR-RENDER-URL.onrender.com/health`
2. You should see: `{"ok":true}`

### 5.2 Check frontend uses backend

1. Open your Vercel URL in a **new incognito/private window**.
2. Open DevTools (F12) → **Network** tab.
3. Try **Sign Up** with test credentials.
4. In Network, confirm requests go to `https://YOUR-RENDER-URL.onrender.com/api/...` — **not** `localhost`.

### 5.3 Sign up / Login flow

1. Sign up with a new email.
2. If it works, the frontend is correctly calling the Render backend.
3. If you see "run npm run dev" or requests to localhost, `VITE_API_URL` is wrong or you didn’t redeploy after setting it.

---

## Troubleshooting

### "Route not found" on /ping or /status

- **Cause:** Render is running an old build.
- **Fix:** Push latest code to GitHub, then in Render: **Manual Deploy** → **Deploy latest commit**.

### Frontend still calls localhost

- **Cause:** `VITE_API_URL` not set, or Vercel wasn’t redeployed after setting it.
- **Fix:**
  1. Vercel → Settings → Environment Variables → confirm `VITE_API_URL` = Render URL.
  2. Deployments → Redeploy (create a new deployment).

### CORS errors when signing up

- **Cause:** Backend `BASE_URL` doesn’t match Vercel URL, or CORS isn’t configured for it.
- **Fix:** Set `BASE_URL` on Render to your exact Vercel URL, redeploy backend.

### Database connection errors on Render

- **Cause:** `DATABASE_URL` wrong or Postgres not reachable.
- **Fix:** Use **Internal Database URL** from Render Postgres (same region as backend).

---

## Quick Checklist

- [ ] Code pushed to GitHub (`main` branch)
- [ ] Render: `DATABASE_URL`, `JWT_SECRET`, `BASE_URL` set
- [ ] Render: `/health`, `/ping`, `/status` return JSON (not 404)
- [ ] Vercel: `VITE_API_URL` = Render backend URL (no trailing slash)
- [ ] Vercel: Redeployed **after** setting `VITE_API_URL`
- [ ] Render: `BASE_URL` = Vercel frontend URL
- [ ] Sign up from Vercel URL works (Network tab shows Render domain)
