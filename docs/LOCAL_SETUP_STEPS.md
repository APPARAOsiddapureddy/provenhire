# Step-by-step: Fix "Server unavailable" and Google sign-in errors

Use this checklist when you see **503 (Service Unavailable)** or **"Server unavailable. Start the backend..."** or **Cross-Origin-Opener-Policy** warnings.

---

## Step 1: Start the backend (fixes 503)

The frontend at `localhost:8080` sends all `/api` requests to the backend. If the backend is not running, you get **503** and "Server unavailable".

**Do this first:**

1. Open a terminal in the project root: `/Users/siva/Downloads/provenhire`
2. Start both frontend and backend in one go (recommended):
   ```bash
   npm run dev
   ```
   This runs the frontend (Vite on port 8080) and the backend (API on port 10000) together. Wait until you see the backend message: `ProvenHire API listening on 10000 (HTTP + Socket.io)`.

**Alternatively**, start only the frontend, then the backend in a second terminal:
```bash
# Terminal 1 – frontend only
npm run dev:frontend

# Terminal 2 – backend
npm run dev:server
```
Or use `npm run dev:all` (same as `npm run dev`).

**Note:** In **production** (e.g. Vercel), the frontend is static and API requests go to your backend via Vercel rewrites. There is no Vite proxy, so you will not see "http proxy error" or ECONNREFUSED in production — only in local dev when the backend is not running. The app shows a "Server unavailable" message to users when the API is unreachable.

---

## Step 2: Confirm backend is reachable

1. In a **new** terminal (or in the browser), check the backend:
   ```bash
   curl -s http://localhost:10000/health
   ```
   You should see: `{"ok":true}`

2. If that fails:
   - Make sure nothing else is using port **10000**.
   - If you run the backend on another port (e.g. 5001), add to the **project root** `.env`:
     ```env
     VITE_API_PROXY_TARGET=http://localhost:5001
     ```
     Then restart the **Vite** dev server (`npm run dev`).

---

## Step 3: Database and migrations (if 503 persists or "Database temporarily unavailable")

If you see **"Database temporarily unavailable. Please try again in a moment."** (e.g. when submitting the aptitude test), or the backend crashes with a Prisma error like **"The column X does not exist"**, the database is not reachable or the schema is out of date.

1. Ensure **PostgreSQL** is running. On macOS with Homebrew:
   - If you see `Formula postgresql@18 is not installed`, install and start the version you need, e.g.:
     ```bash
     brew install postgresql@15
     brew services start postgresql@15
     ```
     Or use the default: `brew install postgresql && brew services start postgresql`. Use the same version in your `DATABASE_URL` (default port 5432).
2. In `server/.env` you must have:
   ```env
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME
   ```
3. **Apply schema to the database.** Try in order:
   - **Option A** (if migration history is clean):
     ```bash
     cd server && npx prisma migrate deploy
     ```
     If you get **P3015** ("Could not find the migration file at prisma/migrations/.../migration.sql"): the migration folder exists but the file was removed. Restore the missing `migration.sql` in that folder (or ask the team for it), or remove the empty migration directory and run `npx prisma migrate resolve --rolled-back MIGRATION_NAME` before running `migrate deploy` again.
   - **Option B** (if you get "column X does not exist" or migrate fails): run the fix script:
     ```bash
     cd server && npx prisma db execute --file prisma/fix-missing-columns.sql
     ```
     Or with `psql`: `psql "YOUR_DATABASE_URL" -f server/prisma/fix-missing-columns.sql`
   - **Option C** (new project, no data): `cd server && npx prisma db push`
4. Restart the backend after any DB change (`npm run dev:server`).

---

## Step 4: Restart the frontend (after any .env or config change)

After changing `.env` or `vite.config.ts`:

1. Stop the Vite dev server (Ctrl+C in the terminal where `npm run dev` is running).
2. Start it again:
   ```bash
   npm run dev
   ```
3. Hard-refresh the app in the browser (Cmd+Shift+R or Ctrl+Shift+R).

---

## Step 5: Google SSO and Settings

- **Google sign-in**: Ensure backend is running (Step 1). If you see "Invalid or expired Google sign-in", check that Firebase Admin is configured on the server (see `docs/GOOGLE_AUTH_SETUP.md`). Popup cancelled/blocked messages are shown in the app.
- **Settings page**: If you see "Server unavailable", start the backend and click **Retry**. If you see "Session expired", click **Sign in again** and sign in with Google or email.

---

## Step 6: Cross-Origin-Opener-Policy warning (Firebase popup)

If you see in the console:

```text
Cross-Origin-Opener-Policy policy would block the window.closed call.
```

- This is a **known Firebase/Chrome warning**. Sign-in can still succeed.
- This project does **not** set a strict COOP header in dev so the popup can close correctly.
- If the warning still appears, you can ignore it; focus on fixing 503 by keeping the backend running (Steps 1–3).

---

## Quick reference

| Symptom | Fix |
|--------|-----|
| 503 on `/api/auth/google` or other `/api/*` | Run `npm run dev` (starts both frontend and backend) or `npm run dev:server` in a second terminal (Step 1) |
| "Server unavailable" toast | Same as above; backend must run on port 10000 (or set `VITE_API_PROXY_TARGET`) |
| **"Database temporarily unavailable"** on aptitude submit | Backend is up; DB is not. Ensure PostgreSQL is running, then `cd server && npx prisma migrate deploy` (Step 3). Then click Submit again. |
| Backend starts but APIs still 503 or Prisma "column does not exist" | Run migrations: `cd server && npx prisma migrate deploy` or `npx prisma db push` (Step 3) |
| COOP / window.closed warning in console | Safe to ignore; auth can still work (Step 6) |
| Settings "Session expired" | Click **Sign in again** and sign in (Step 5) |

**Recommended:** Run `npm run dev` from the project root so both frontend and backend start together. If you see "Server unavailable" or 503 on Settings or Aptitude submit, the backend is not running — use this one command.
