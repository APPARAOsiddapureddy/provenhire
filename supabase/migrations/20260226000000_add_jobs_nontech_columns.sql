-- Add missing columns to jobs (job_track, role_category, company_context, assignment_threshold).
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- Fixes: "Could not find the 'assignment_threshold' column of 'jobs' in the schema cache"

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_track text DEFAULT 'tech',
  ADD COLUMN IF NOT EXISTS role_category text,
  ADD COLUMN IF NOT EXISTS company_context text,
  ADD COLUMN IF NOT EXISTS assignment_threshold numeric DEFAULT 60;

COMMENT ON COLUMN public.jobs.job_track IS 'tech | non_technical';
COMMENT ON COLUMN public.jobs.role_category IS 'For non_technical: Marketing, Sales, etc.';
COMMENT ON COLUMN public.jobs.company_context IS 'Brief description of company; required for non-tech assignment generation';
COMMENT ON COLUMN public.jobs.assignment_threshold IS 'Min AI score to show assignment to recruiter; default 60';
