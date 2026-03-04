# ProvenHire Deployment Guide

Step-by-step guide to deploy the frontend (Vercel) and backend (Railway or Render) with PostgreSQL.

---

## Overview

| Component | Platform | Purpose |
|-----------|----------|---------|
| Frontend  | Vercel   | React app (Vite) |
| Backend   | Railway or Render | Express + Prisma API |
| Database  | Railway Postgres, Render Postgres, or Neon | PostgreSQL |

---

## Part 1: Database (do this first)

You need a PostgreSQL database. Options:

### Option A: Railway (recommended)

1. Go to [railway.app](https://railway.app) and sign up (GitHub).
2. **New Project** → **Provision PostgreSQL**.
3. Click the PostgreSQL service → **Variables** tab.
4. Copy `DATABASE_URL` (you'll use this for the backend).

### Option B: Render

1. Go to [render.com](https://render.com) → **Dashboard** → **New +** → **PostgreSQL**.
2. Create a free instance, choose a name and region.
3. Copy **Internal Database URL** (for backend on Render) or **External Database URL** (for other platforms).

### Option C: Neon (free tier)

1. Go to [neon.tech](https://neon.tech) and create a project.
2. Copy the connection string from the dashboard.

---

## Part 2: Backend Deployment

### Using Railway

1. **Create a new project** (or use the same one as Postgres).
2. **Add Service** → **GitHub Repo** → select your ProvenHire repo.
3. Configure:
   - **Root Directory:** `server`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Watch Paths:** `server/**`
4. **Variables** (Settings → Variables):

   | Variable        | Value                                      |
   |-----------------|--------------------------------------------|
   | `PORT`          | `5001` (or leave default; Railway sets it) |
   | `DATABASE_URL`  | Your Postgres connection string            |
   | `JWT_SECRET`    | Strong random string (e.g. from 1Password) |
   | `BASE_URL`      | Your frontend URL (e.g. `https://yourapp.vercel.app`) |
   | `DAILY_API_KEY` | (Optional) Daily.co API key                 |
   | `DAILY_DOMAIN`  | (Optional) Daily.co subdomain               |
   | `GEMINI_API_KEY`| (Optional) For resume parsing              |
   | `OPENAI_API_KEY`| (Optional) For AI features                  |

5. **Deploy** → Railway will build and deploy.
6. Copy your backend URL (e.g. `https://provenhire-server-production.up.railway.app`).
7. **Run migrations:**
   - In Railway: **Service** → **Settings** → **Deploy**.
   - Or add a custom start:  
     `npx prisma migrate deploy && node dist/server.js`  
   - Or in **Settings** → **Deploy** → **Build Command:**  
     `npm install && npx prisma generate && npm run build`

   **Easier:** Add to `server/package.json`:

   ```json
   "start": "prisma migrate deploy && node dist/server.js"
   ```

   Then Railway will run migrations on every deploy.

---

### Using Render

1. Go to [render.com](https://render.com) → **New +** → **Web Service**.
2. Connect your GitHub repo.
3. Configure:
   - **Name:** `provenhire-server`
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npx prisma migrate deploy && npm run start`
4. **Environment** (Environment tab):

   Same variables as Railway (see table above).

5. Create Web Service → Render builds and deploys.
6. Copy your backend URL (e.g. `https://provenhire-server.onrender.com`).

---

## Part 3: Frontend Deployment (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New** → **Project** → import your ProvenHire repo.
3. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** `.` (or leave default)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. **Environment Variables:**

   | Variable        | Value                                      |
   |-----------------|--------------------------------------------|
   | `VITE_API_URL`  | Your backend URL (e.g. `https://provenhire-server.onrender.com`) |

   Do **not** add a trailing slash to `VITE_API_URL`.

5. **Deploy** → Vercel builds and deploys the frontend.
6. Copy your frontend URL (e.g. `https://provenhire.vercel.app`).

---

## Part 4: Connect Frontend and Backend

1. **Update backend `BASE_URL`:**
   - In Railway/Render, set `BASE_URL` to your Vercel URL (e.g. `https://provenhire.vercel.app`).

2. **Update backend CORS (if needed):**
   - The server should allow your frontend origin. Check `server/server.ts` or `server/src/app.ts` for CORS and ensure the Vercel domain is allowed.

3. **Redeploy backend** so it picks up the new `BASE_URL`.

---

## Part 5: Final Checklist

- [ ] Database created and `DATABASE_URL` set on backend
- [ ] Backend deployed and reachable (test `https://your-backend.com/api/health` if you have one)
- [ ] Frontend has `VITE_API_URL` pointing to the backend
- [ ] Backend has `BASE_URL` pointing to the frontend
- [ ] Prisma migrations run (`prisma migrate deploy`)
- [ ] `JWT_SECRET` set to a strong random value

---

## Summary URLs

| Service | Example URL |
|--------|-------------|
| Frontend (Vercel) | `https://provenhire.vercel.app` |
| Backend (Railway) | `https://provenhire-server.up.railway.app` |
| Backend (Render)  | `https://provenhire-server.onrender.com` |
| Database          | (Internal to Railway/Render or Neon)     |

---

## Troubleshooting

### CORS errors

- Ensure `BASE_URL` on the backend matches your Vercel URL exactly.
- Check CORS config in your Express app allows your frontend origin.

### 502 / Backend not starting

- Verify `DATABASE_URL` is correct and reachable.
- Check build logs: Prisma generate and migrations must run before `node dist/server.js`.
- Ensure `PORT` is read from `process.env.PORT` (Railway/Render inject it).

### Frontend can't reach API

- Set `VITE_API_URL` on Vercel to the backend URL (no trailing slash).
- Redeploy after adding/changing env vars.

### Migrations

- Run `npx prisma migrate deploy` before starting the server, or add it to the start script as shown above.
