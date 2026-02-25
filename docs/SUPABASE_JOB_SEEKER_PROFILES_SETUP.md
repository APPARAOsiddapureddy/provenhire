# Supabase: Fix "no job_seeker_profiles" Error

The app uses the table **`job_seeker_profiles`** (with an **s** on *profiles*).  
If you see an error like "relation job_seekers_profile does not exist" or "there is no job_seekers_profile", either the table is missing or the name is wrong.

---

## Option A: Run migrations (recommended)

If you use the Supabase CLI and this repo’s migrations:

1. Install Supabase CLI and link your project:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
2. Apply migrations:
   ```bash
   npx supabase db push
   ```
   This creates/updates `job_seeker_profiles`, `verification_stages`, and other tables.

---

## Option B: Create the table manually in Supabase

If you don’t use migrations, run the SQL below in the **Supabase Dashboard → SQL Editor**.

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor**.
3. Paste and run the script from **`supabase/scripts/create_job_seeker_profiles_if_missing.sql`** (see that file in this repo).

After it runs, the table name must be exactly **`job_seeker_profiles`** (not `job_seekers_profile` or `job_seeker_profile`). The app only queries `job_seeker_profiles`.

---

## Checklist

- [ ] Table exists: **Table Editor** → look for **`job_seeker_profiles`** (plural *profiles*).
- [ ] RLS is enabled on the table.
- [ ] Policies allow: SELECT / INSERT / UPDATE for the authenticated user on their own row (`auth.uid() = user_id`), and SELECT for recruiters (see the script or migrations).
- [ ] No table named `job_seekers_profile` (wrong name); the app does not use that.

---

## If the table already exists under a different name

If you created a table like `job_seekers_profile` (wrong name):

1. In **SQL Editor** run:
   ```sql
   -- Only if your table is actually named wrong, e.g. job_seekers_profile
   ALTER TABLE public.job_seekers_profile RENAME TO job_seeker_profiles;
   ```
2. Or create the correct table and copy data:
   - Run the create script for `job_seeker_profiles`.
   - Then:
     ```sql
     INSERT INTO public.job_seeker_profiles (user_id, ...)
     SELECT user_id, ... FROM public.job_seekers_profile;
     ```

Use the rename only if the table name is wrong; otherwise prefer Option A or B above.
