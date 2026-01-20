-- Fix the get_user_role function to have proper search_path
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles WHERE user_roles.user_id = $1 LIMIT 1;
$$;

-- Create a helper function to check if a user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- Create a helper function to check if user is a jobseeker
CREATE OR REPLACE FUNCTION public.is_jobseeker(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'jobseeker'::app_role
  );
$$;

-- Create a helper function to check if user is a recruiter
CREATE OR REPLACE FUNCTION public.is_recruiter(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'recruiter'::app_role
  );
$$;

-- Update job_seeker_profiles RLS policies to use the helper function
DROP POLICY IF EXISTS "Users can view their own job seeker profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Users can insert their own job seeker profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Users can update their own job seeker profile" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "Recruiters can view job seeker profiles" ON public.job_seeker_profiles;

CREATE POLICY "Job seekers can view their own profile" 
ON public.job_seeker_profiles 
FOR SELECT 
USING (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Job seekers can insert their own profile" 
ON public.job_seeker_profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Job seekers can update their own profile" 
ON public.job_seeker_profiles 
FOR UPDATE 
USING (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Recruiters can view all job seeker profiles" 
ON public.job_seeker_profiles 
FOR SELECT 
USING (public.is_recruiter(auth.uid()));

-- Update jobs RLS policies
DROP POLICY IF EXISTS "Everyone can view active jobs" ON public.jobs;
DROP POLICY IF EXISTS "Recruiters can manage their own jobs" ON public.jobs;

CREATE POLICY "Anyone can view active jobs" 
ON public.jobs 
FOR SELECT 
USING (status = 'active');

CREATE POLICY "Recruiters can insert jobs" 
ON public.jobs 
FOR INSERT 
WITH CHECK (auth.uid() = recruiter_id AND public.is_recruiter(auth.uid()));

CREATE POLICY "Recruiters can update their own jobs" 
ON public.jobs 
FOR UPDATE 
USING (auth.uid() = recruiter_id AND public.is_recruiter(auth.uid()));

CREATE POLICY "Recruiters can delete their own jobs" 
ON public.jobs 
FOR DELETE 
USING (auth.uid() = recruiter_id AND public.is_recruiter(auth.uid()));

-- Update job_applications RLS policies
DROP POLICY IF EXISTS "Job seekers can view their own applications" ON public.job_applications;
DROP POLICY IF EXISTS "Job seekers can create applications" ON public.job_applications;
DROP POLICY IF EXISTS "Recruiters can view applications for their jobs" ON public.job_applications;
DROP POLICY IF EXISTS "Recruiters can update applications for their jobs" ON public.job_applications;

CREATE POLICY "Job seekers can view their own applications" 
ON public.job_applications 
FOR SELECT 
USING (auth.uid() = job_seeker_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Job seekers can create applications" 
ON public.job_applications 
FOR INSERT 
WITH CHECK (auth.uid() = job_seeker_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Recruiters can view applications for their jobs" 
ON public.job_applications 
FOR SELECT 
USING (
  public.is_recruiter(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_applications.job_id 
    AND jobs.recruiter_id = auth.uid()
  )
);

CREATE POLICY "Recruiters can update applications for their jobs" 
ON public.job_applications 
FOR UPDATE 
USING (
  public.is_recruiter(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE jobs.id = job_applications.job_id 
    AND jobs.recruiter_id = auth.uid()
  )
);

-- Update saved_jobs RLS policies
DROP POLICY IF EXISTS "Users can view their own saved jobs" ON public.saved_jobs;
DROP POLICY IF EXISTS "Users can save jobs" ON public.saved_jobs;
DROP POLICY IF EXISTS "Users can delete their own saved jobs" ON public.saved_jobs;

CREATE POLICY "Job seekers can view their saved jobs" 
ON public.saved_jobs 
FOR SELECT 
USING (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Job seekers can save jobs" 
ON public.saved_jobs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Job seekers can unsave jobs" 
ON public.saved_jobs 
FOR DELETE 
USING (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

-- Update verification_stages RLS policies
DROP POLICY IF EXISTS "Users can view their own verification stages" ON public.verification_stages;
DROP POLICY IF EXISTS "Users can insert their own verification stages" ON public.verification_stages;
DROP POLICY IF EXISTS "Users can update their own verification stages" ON public.verification_stages;

CREATE POLICY "Job seekers can view their verification stages" 
ON public.verification_stages 
FOR SELECT 
USING (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Job seekers can insert their verification stages" 
ON public.verification_stages 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

CREATE POLICY "Job seekers can update their verification stages" 
ON public.verification_stages 
FOR UPDATE 
USING (auth.uid() = user_id AND public.is_jobseeker(auth.uid()));

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_jobseeker(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_recruiter(uuid) TO authenticated;