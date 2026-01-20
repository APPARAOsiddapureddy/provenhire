-- Extend job seeker profiles with additional resume fields
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
