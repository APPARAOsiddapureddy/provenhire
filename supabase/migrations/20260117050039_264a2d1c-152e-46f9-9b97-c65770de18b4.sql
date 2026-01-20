-- Fix the proctoring_alerts INSERT policy - require authenticated job seekers
DROP POLICY IF EXISTS "Anyone can insert alerts" ON public.proctoring_alerts;

CREATE POLICY "Job seekers can insert their own alerts"
ON public.proctoring_alerts
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id) AND is_jobseeker(auth.uid())
);

-- Allow job seekers to view their own alerts
CREATE POLICY "Job seekers can view their own alerts"
ON public.proctoring_alerts
FOR SELECT
TO authenticated
USING (
  (auth.uid() = user_id) AND is_jobseeker(auth.uid())
);