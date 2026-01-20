-- Allow recruiters to update aptitude test results (for invalidation)
CREATE POLICY "Recruiters can update aptitude test results"
ON public.aptitude_test_results
FOR UPDATE
TO authenticated
USING (is_recruiter(auth.uid()))
WITH CHECK (is_recruiter(auth.uid()));

-- Allow recruiters to view all aptitude test results
CREATE POLICY "Recruiters can view all aptitude test results"
ON public.aptitude_test_results
FOR SELECT
TO authenticated
USING (is_recruiter(auth.uid()));

-- Allow recruiters to update dsa test results (for invalidation)
CREATE POLICY "Recruiters can update dsa test results"
ON public.dsa_round_results
FOR UPDATE
TO authenticated
USING (is_recruiter(auth.uid()))
WITH CHECK (is_recruiter(auth.uid()));

-- Allow recruiters to view all dsa test results
CREATE POLICY "Recruiters can view all dsa test results"
ON public.dsa_round_results
FOR SELECT
TO authenticated
USING (is_recruiter(auth.uid()));

-- Allow recruiters to update verification stages (for marking retake required)
CREATE POLICY "Recruiters can update verification stages"
ON public.verification_stages
FOR UPDATE
TO authenticated
USING (is_recruiter(auth.uid()))
WITH CHECK (is_recruiter(auth.uid()));

-- Allow recruiters to view all verification stages
CREATE POLICY "Recruiters can view all verification stages"
ON public.verification_stages
FOR SELECT
TO authenticated
USING (is_recruiter(auth.uid()));