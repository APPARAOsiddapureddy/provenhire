-- Fix 1: Add storage policies for admins and recruiters to view proctoring recordings
-- This allows admins and recruiters to review test recordings for proctoring purposes

CREATE POLICY "Admins can view all proctoring recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proctoring-recordings'
  AND is_admin(auth.uid())
);

CREATE POLICY "Recruiters can view all proctoring recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proctoring-recordings'
  AND is_recruiter(auth.uid())
);

-- Fix 2: Restrict job seeker profile access for recruiters
-- Drop the overly permissive policy that allows all recruiters to see all profiles
DROP POLICY IF EXISTS "Recruiters can view all job seeker profiles" ON job_seeker_profiles;

-- Create a more restrictive policy that only allows recruiters to view:
-- 1. Profiles of candidates who applied to their jobs
-- 2. Profiles of verified candidates (for candidate search feature)
CREATE POLICY "Recruiters can view applicant and verified profiles"
ON job_seeker_profiles FOR SELECT
TO authenticated
USING (
  is_recruiter(auth.uid()) AND (
    -- Allow viewing candidates who applied to their jobs
    EXISTS (
      SELECT 1 FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      WHERE ja.job_seeker_id = job_seeker_profiles.user_id
      AND j.recruiter_id = auth.uid()
    )
    -- Or allow viewing verified candidates for talent pool browsing
    OR (verification_status = 'verified')
  )
);