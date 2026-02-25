# Test Credentials (ProvenHire)

One test account is stored in Supabase in the **`credentials`** table. You can sign in with it **without signing up**; the app validates email/password against this table and logs you in.

---

## Test accounts (credentials table)

| Role        | Email | Password |
|-------------|--------|----------|
| **Job Seeker** | jobseeker1@provenhiretest.com | TestJobSeeker1! |
| **Recruiter**  | recruiter1@provenhiretest.com  | TestRecruiter1!  |

Use these on the **Sign in** form. No sign-up or email confirmation needed.

**Note:** Test accounts use a bypass login (no real Supabase Auth user). They can use the recruiter dashboard and job seeker flows, but **posting a job as the test recruiter won't save** — the database expects a real recruiter UUID. Sign up with a full recruiter account to post and save jobs.

---

## Setup (one-time)

1. **Apply the migration** so the `credentials` table and RPC exist:
   ```bash
   npx supabase db push
   ```
   Or run the SQL in **Supabase Dashboard → SQL Editor**: use the contents of  
   `supabase/migrations/20260225000000_credentials_table_test_login.sql`

   **If you already applied the migration when it only had the job seeker**, add the recruiter in SQL Editor:
   ```sql
   INSERT INTO public.credentials (email, password, role)
   VALUES ('recruiter1@provenhiretest.com', 'TestRecruiter1!', 'recruiter')
   ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;
   ```

2. After that, open the app, go to Sign in, and use either:
   - **Job seeker:** `jobseeker1@provenhiretest.com` / `TestJobSeeker1!`
   - **Recruiter:** `recruiter1@provenhiretest.com` / `TestRecruiter1!`

---

## How it works

- On sign-in, the app calls the Supabase RPC **`check_test_credentials`** with the email and password.
- If they match the row in **`public.credentials`**, you are logged in as that role (bypassing Supabase Auth).
- If they don’t match, the app falls back to normal **Supabase Auth** sign-in.

---

## Add more test accounts or change password/role

In **Supabase Dashboard → SQL Editor** run:

```sql
-- Add another test account (e.g. recruiter)
INSERT INTO public.credentials (email, password, role)
VALUES ('recruiter1@provenhiretest.com', 'TestRecruiter1!', 'recruiter')
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role;

-- Change password for existing email
UPDATE public.credentials SET password = 'NewPassword1!' WHERE email = 'jobseeker1@provenhiretest.com';

-- Change role (jobseeker | recruiter | admin | expert_interviewer)
UPDATE public.credentials SET role = 'admin' WHERE email = 'jobseeker1@provenhiretest.com';
```

---

## After testing: block or remove

- **Remove test rows:**  
  `DELETE FROM public.credentials WHERE email IN ('jobseeker1@provenhiretest.com', 'recruiter1@provenhiretest.com');`
- **Or drop the table and RPC:**  
  `DROP FUNCTION IF EXISTS public.check_test_credentials(text, text);`  
  `DROP TABLE IF EXISTS public.credentials;`

**Important:** Do not use this test account in production. Remove or block it when you are done testing.

---

## Recruiter: "Could not find the 'assignment_threshold' column" when posting a job

If you see this error when posting a job, your database is missing columns added by a later migration. Apply migrations:

```bash
npx supabase db push
```

Or in **Supabase Dashboard → SQL Editor**, run the contents of  
`supabase/migrations/20260226000000_add_jobs_nontech_columns.sql` to add the missing `jobs` columns (`job_track`, `role_category`, `company_context`, `assignment_threshold`).
