-- Run this in Supabase Dashboard → SQL Editor if you get "job_seeker_profiles does not exist"
-- or "no job_seekers_profile" (wrong name). The app expects the table: job_seeker_profiles (with 's' on profiles).

-- 1) Create table if missing (exact name: job_seeker_profiles)
CREATE TABLE IF NOT EXISTS public.job_seeker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  resume_url text,
  college text,
  graduation_year integer,
  experience_years integer,
  skills text[],
  actively_looking_roles text[],
  projects jsonb DEFAULT '[]'::jsonb,
  hobbies text[],
  bio text,
  phone text,
  location text,
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'in_progress', 'verified', 'rejected')),
  profile_views integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 2) Add columns that later migrations introduce (safe to run multiple times)
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS degree text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS field_of_study text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS cgpa text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS current_company text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS "current_role" text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS notice_period text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS expected_salary text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS current_salary text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS join_date date;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS currently_working boolean;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS portfolio_url text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS certifications text[];
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS languages text[];
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS public_id text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS track text DEFAULT 'tech';
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS role_category text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS reverification_due_at timestamptz;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS nontech_verified_at timestamptz;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS nontech_reverification_due_at timestamptz;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS nontech_public_id text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS nontech_public_url text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS verification_tier text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS verification_level text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS verification_public_id text;
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS verification_public_url text;

-- 3) Enable RLS
ALTER TABLE public.job_seeker_profiles ENABLE ROW LEVEL SECURITY;

-- 4) Drop old policy names (from various migrations) then create the ones the app needs
DROP POLICY IF EXISTS "Users can view their own job seeker profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Users can insert their own job seeker profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Users can update their own job seeker profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Recruiters can view job seeker profiles" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Job seekers can view their own profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Job seekers can insert their own profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Job seekers can update their own profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Recruiters can view all job seeker profiles" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.job_seeker_profiles;

CREATE POLICY "Users can view their own profile"
ON public.job_seeker_profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.job_seeker_profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.job_seeker_profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Recruiters can view job seeker profiles"
ON public.job_seeker_profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'recruiter'
  )
);

-- 5) If your table was wrongly named job_seekers_profile, rename it (run only if needed):
-- ALTER TABLE IF EXISTS public.job_seekers_profile RENAME TO job_seeker_profiles;
