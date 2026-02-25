# Complete Supabase Setup — ProvenHire

**Project:** `psjzzdycssokajbrhtol`  
**Project URL:** https://psjzzdycssokajbrhtol.supabase.co

Follow these steps in order. Tick each when done.

---

## 1. Confirm project is active

1. Go to **[Supabase Dashboard](https://supabase.com/dashboard)** and open project **psjzzdycssokajbrhtol**.
2. Ensure the project status is **Active** (not Paused).
3. If it was paused and you just resumed it, wait **2–3 minutes** before continuing.

---

## 2. Environment variables (optional)

The app has built-in fallbacks for this project, so it works without a `.env` file. To override (e.g. for another project or different keys), create a `.env` in the project root:

```env
VITE_SUPABASE_URL=https://psjzzdycssokajbrhtol.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-public-key>
```

- Get the anon key: **Settings → API** in the Supabase Dashboard → **Project API keys** → **anon public**.

---

## 3. Auth URL configuration (fix CORS / redirect errors)

1. In the Dashboard, go to **Authentication** (left sidebar) → **URL Configuration**.
2. Set:

   | Field | Value |
   |--------|--------|
   | **Site URL** | `http://localhost:8080` (or the port your app uses, e.g. `http://localhost:5173`) |
   | **Redirect URLs** | Add one per line:<br>• `http://localhost:8080/**`<br>• `http://localhost:8080/auth**`<br>• If you use another port: `http://localhost:5173/**` and `http://localhost:5173/auth**` |

3. Click **Save**.

---

## 4. Database setup

You can either run all migrations (recommended) or fix only the missing table.

### Option A — Run all migrations (recommended)

From the **project root** in a terminal:

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Log in (opens browser)
npx supabase login

# Link this repo to your project (project ref = psjzzdycssokajbrhtol)
npx supabase link --project-ref psjzzdycssokajbrhtol

# Push all migrations to the remote database
npx supabase db push
```

When prompted for the database password, use the one from **Settings → Database** in the Dashboard (or reset it there if you don’t have it).

This creates/updates all tables: `profiles`, `user_roles`, `job_seeker_profiles`, `verification_stages`, `jobs`, etc., plus RLS policies and triggers (e.g. `handle_new_user` for sign-up).

### Option B — Only fix “job_seeker_profiles does not exist”

If you don’t use the CLI and only see errors about `job_seeker_profiles` (or “no job_seekers_profile”):

1. In the Dashboard go to **SQL Editor**.
2. Open the file **`supabase/scripts/create_job_seeker_profiles_if_missing.sql`** from this repo.
3. Copy its full contents, paste into a new query, and click **Run**.

That creates the `job_seeker_profiles` table and its RLS policies. You may still need to create other tables (e.g. `verification_stages`, `user_roles`, `profiles`) if you get similar errors — in that case use **Option A**.

---

## 5. Verify in the Dashboard

- **Table Editor:** You should see at least:
  - `profiles`
  - `user_roles`
  - `job_seeker_profiles`
  - `verification_stages`
- **Authentication → URL Configuration:** Site URL and Redirect URLs are set as in step 3.
- **Settings → API:** Project URL is `https://psjzzdycssokajbrhtol.supabase.co` and you have an **anon public** key.

---

## 6. Run the app

From the project root:

```bash
npm install
npm run dev
```

Open the URL shown (e.g. http://localhost:8080). Try:

1. **Sign up** as job seeker or recruiter.
2. **Sign in** and open the **Job Seeker Dashboard**.
3. Go to **Verification** and open the **Resume upload** step.

If anything fails, check the browser console and Network tab for the exact error (e.g. 400, 403, CORS, or “relation … does not exist”).

---

## Quick checklist

| Step | Action |
|------|--------|
| 1 | Project is **Active**; wait 2–3 min after resume |
| 2 | (Optional) `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` |
| 3 | **Authentication → URL Configuration**: Site URL + Redirect URLs for your dev port |
| 4 | **Database**: `npx supabase link --project-ref psjzzdycssokajbrhtol` then `npx supabase db push` (or run `create_job_seeker_profiles_if_missing.sql` in SQL Editor) |
| 5 | Table Editor shows `job_seeker_profiles`, `verification_stages`, `user_roles`, `profiles` |
| 6 | `npm run dev` → sign up / sign in / verification flow works |

---

## Common errors and fixes

| Error | Fix |
|-------|-----|
| CORS / 521 on login | Step 3: add your app URL and port to Redirect URLs; wait 2–3 min if project just resumed |
| “relation job_seeker_profiles does not exist” | Step 4 Option B: run `create_job_seeker_profiles_if_missing.sql` in SQL Editor; or do Option A and run all migrations |
| “no job_seekers_profile” | Table name must be **job_seeker_profiles** (with “s” on *profiles*). Create/rename as in Step 4. |
| 400 on verification_stages | App code was updated to use `insert` instead of `upsert`; ensure you’re on the latest code and DB has `verification_stages` (Step 4 Option A). |
| Sign up but no role/profile | Run migrations so the `handle_new_user` trigger exists (Step 4 Option A). |

Your project link **https://psjzzdycssokajbrhtol.supabase.co** is already configured in the app; after the steps above, no code changes are required for this project.
