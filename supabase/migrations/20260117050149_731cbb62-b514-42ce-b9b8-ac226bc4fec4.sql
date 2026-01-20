-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
  )
$$;

-- Admin policies for job seekers profiles
CREATE POLICY "Admins can view all job seeker profiles"
ON public.job_seeker_profiles
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for profiles table
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for test results
CREATE POLICY "Admins can view all aptitude test results"
ON public.aptitude_test_results
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update aptitude test results"
ON public.aptitude_test_results
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all DSA results"
ON public.dsa_round_results
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update DSA results"
ON public.dsa_round_results
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for jobs
CREATE POLICY "Admins can view all jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for user roles
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for newsletter subscribers
CREATE POLICY "Admins can view all newsletter subscribers"
ON public.newsletter_subscribers
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for test appeals
CREATE POLICY "Admins can view all test appeals"
ON public.test_appeals
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update test appeals"
ON public.test_appeals
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for proctoring_alerts
CREATE POLICY "Admins can view all proctoring alerts"
ON public.proctoring_alerts
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update proctoring alerts"
ON public.proctoring_alerts
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

-- Admin policies for admin messages (admins can insert)
CREATE POLICY "Admins can insert admin messages"
ON public.admin_messages
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can view all admin messages"
ON public.admin_messages
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));