-- Create a public view for jobs that excludes recruiter_id
-- This prevents exposure of recruiter UUIDs via direct API access
CREATE OR REPLACE VIEW public.jobs_public AS
SELECT 
  id, 
  title, 
  company, 
  description, 
  location, 
  salary_range, 
  required_skills, 
  job_type, 
  experience_required, 
  status, 
  created_at, 
  updated_at
FROM public.jobs
WHERE status = 'active';

-- Enable RLS on the view (required for security)
ALTER VIEW public.jobs_public SET (security_invoker = true);

-- Grant SELECT access to authenticated and anonymous users
GRANT SELECT ON public.jobs_public TO anon;
GRANT SELECT ON public.jobs_public TO authenticated;