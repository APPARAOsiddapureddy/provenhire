# ProvenHire: Complete Vercel + Render Deployment Guide

Step-by-step guide to fix and verify the full deployment flow.

---

## Architecture

```
[User] → Vercel (Frontend) → Render (Backend) → Render Postgres (Database)
```

- **Frontend (Vercel):** React app, calls backend via `VITE_API_URL`
- **Backend (Render):** Express API, CORS reflects request origin (`origin: true`)

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
| **Build Command** | `npm install && npx prisma generate && npm run build && npx prisma migrate deploy` |
| **Start Command** | `npm run start` |
| **Instance Type** | Free (or paid) |

**Important:** `prisma migrate deploy` runs during build. If `DATABASE_URL` is wrong or the database is unreachable, the **build will fail** and you'll see the error in Build Logs. Fix the database connection before the service can start.

### 2.3 Environment Variables (Render) — Step-by-Step

On the **Environment Variables** section of the "New Web Service" page, you will see rows with two fields:
- **First field (NAME_OF_VARIABLE):** The variable name (e.g. `DATABASE_URL`)
- **Second field (value):** The actual value (e.g. the database connection string)

Add variables one by one as follows.

---

#### Step 1: Create a PostgreSQL database (do this first)

1. In Render Dashboard, click **New +** → **PostgreSQL**.
2. Give it a name (e.g. `provenhire-db`) and choose **Oregon (US West)** (same region as your web service).
3. Click **Create Database**.
4. Wait for it to spin up.
5. Open the database → **Info** tab → find **Internal Database URL**.
6. Click the **copy** icon next to it. It looks like:
   ```
   postgresql://user:password@hostname/database?sslmode=require
   ```
   **Keep this copied** — you will paste it in Step 2.

---

#### Step 2: Add `DATABASE_URL` (required)

1. In the first empty row of **Environment Variables**:
   - **First field (name):** Type exactly: `DATABASE_URL`
   - **Second field (value):** Paste the **Internal Database URL** you copied in Step 1.
2. Do not leave it blank. This is required.

---

#### Step 3: Add `JWT_SECRET` (required)

1. Click **+ Add Environment Variable** to add a new row.
2. In the new row:
   - **First field (name):** Type exactly: `JWT_SECRET`
   - **Second field (value):** Either:
     - Click **Generate** next to the value field to auto-generate a secure string, **or**
     - Generate one yourself: run `openssl rand -hex 32` in your terminal and paste the result (e.g. `a1b2c3d4e5f6...`).
3. This must be a long random string. Do not leave it blank.

---

#### Step 4: Add `PORT` (optional)

1. Click **+ Add Environment Variable**.
2. In the new row:
   - **First field (name):** Type exactly: `PORT`
   - **Second field (value):** Leave **empty**. Render will set it automatically.
   - Or simply **skip** this — Render injects `PORT` by default.

---

#### Step 5: Add `BASE_URL` (optional — add after Vercel deploy)

1. Click **+ Add Environment Variable**.
2. In the new row:
   - **First field (name):** Type exactly: `BASE_URL`
   - **Second field (value):** Your Vercel frontend URL, e.g. `https://provenhire-xxx.vercel.app` (no trailing slash).
   - Add this **after** you deploy the frontend on Vercel. You can add it later in the service’s **Environment** tab.

---

#### Step 6: Add `OPENAI_API_KEY` (optional — for AI features)

1. Click **+ Add Environment Variable**.
2. In the new row:
   - **First field (name):** Type exactly: `OPENAI_API_KEY`
   - **Second field (value):** Your OpenAI API key from [platform.openai.com](https://platform.openai.com).
   - Skip if you are not using OpenAI features yet.

---

#### Step 7: Add `GEMINI_API_KEY` (optional — for AI features)

1. Click **+ Add Environment Variable**.
2. In the new row:
   - **First field (name):** Type exactly: `GEMINI_API_KEY`
   - **Second field (value):** Your Google Gemini API key.
   - Skip if you are not using Gemini features yet.

---

#### Summary: Minimum variables to add

| First field (name) | Second field (value) | Required? |
|--------------------|----------------------|-----------|
| `DATABASE_URL`     | Internal Database URL from Render Postgres | **Yes** |
| `JWT_SECRET`       | Long random string (use **Generate** or `openssl rand -hex 32`) | **Yes** |

All other variables are optional and can be added later.

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

## Part 4: Connect Backend to Frontend (optional)

1. If your app uses `BASE_URL`, set it in Render’s Environment to your Vercel URL.
2. CORS is configured to allow all origins (`origin: true`); no extra env vars needed.

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

### 404 on /api/auth/me or /api/auth/register

- **Cause:** Backend not reachable, wrong Root Directory, or Render serving a placeholder.
- **Fix:**
  1. Open `https://YOUR-RENDER-URL.onrender.com/ping` — if 404, the app isn’t being served.
  2. Render → Your service → **Settings** → ensure **Root Directory** = `server`.
  3. Check **Logs** for startup errors (e.g. Prisma, env vars).
  4. Push latest code and trigger a fresh deploy.

### 502 Bad Gateway (CORS error is a side effect)

- **Cause:** The request reaches Render's proxy, but your backend app doesn't respond. The 502 comes from Render, not your app — so no CORS headers are sent. The browser then reports CORS.
- **Immediate fix — update Render Build Command:**
  1. Render Dashboard → your backend service (e.g. `provenhire-updated`) → **Settings**.
  2. Find **Build Command**. Change it to:  
     `npm install && npx prisma generate && npm run build && npx prisma migrate deploy`
  3. **Save Changes** → **Manual Deploy** → Deploy latest commit.
  4. If the **build fails**, check **Build Logs** — you'll see the exact error (e.g. `DATABASE_URL` wrong, migrations fail). Fix the issue and redeploy.
  5. If the build **succeeds** but you still get 502, open `/health` in a new tab first (to wake the service on free tier), wait 30–60s, then retry sign-up.
- **Required env vars:** `DATABASE_URL` (use **Internal Database URL** from Render Postgres), `JWT_SECRET`.

### CORS errors (“No Access-Control-Allow-Origin header”)

- **Cause 1 (Render free tier):** Service is cold/waking up. **Fix:** Open `/health` first, wait 30–60s, then retry.
- **Cause 2:** 502 Bad Gateway — see above.
- **Fix:** Resolve the 502 first; CORS will work once the app responds.

### Database connection errors on Render

- **Cause:** `DATABASE_URL` wrong or Postgres not reachable.
- **Fix:** Use **Internal Database URL** from Render Postgres (same region as backend).

### Deploy failed - "Exited with status 2 while building"

- **Cause:** TypeScript or build errors (e.g. `JsonValue` type mismatch).
- **Fix:** Ensure you've pushed the latest commit that fixes build errors. Then: Manual Deploy → Deploy latest commit.

### Build fails at "prisma migrate deploy"

- **Cause:** `DATABASE_URL` missing, wrong, or database unreachable. Migrate runs during build now, so DB must be reachable.
- **Fix:**
  1. Create a PostgreSQL database in Render (same region as your web service).
  2. Copy the **Internal Database URL** (not External).
  3. Add `DATABASE_URL` in your service's Environment Variables.
  4. Redeploy.

### Deploy canceled - "Another deploy started"

- **Cause:** A new deploy was triggered (e.g. new push) while the previous one was still running.
- **Fix:** Go to **Settings** → **Deploy** → set **Overlapping Deploys** to **Cancel outdated deploys** (so the newest commit always wins) or **Queue deploys** (so they run one after another).

### Service crashes after deploy (build succeeds, start fails)

- **Cause:** Usually `DATABASE_URL` missing/wrong, `JWT_SECRET` missing, or `prisma migrate deploy` fails.
- **Fix:** Check **Logs** tab for the actual error. Verify env vars. Use **Internal Database URL** from Render Postgres (same region).

---

## Quick Checklist

- [ ] Code pushed to GitHub (`main` branch)
- [ ] Render: `DATABASE_URL`, `JWT_SECRET` set
- [ ] Render: `/health`, `/ping`, `/status` return JSON (not 404)
- [ ] Vercel: `VITE_API_URL` = Render backend URL (no trailing slash)
- [ ] Vercel: Redeployed **after** setting `VITE_API_URL`
- [ ] Sign up from Vercel URL works (Network tab shows Render domain)
