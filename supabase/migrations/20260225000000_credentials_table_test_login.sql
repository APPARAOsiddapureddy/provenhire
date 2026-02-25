-- Test credentials table: one email/password for testing without Supabase Auth sign-up.
-- After testing, drop this table or delete the row. RPC validates and returns role for bypass login.

CREATE TABLE IF NOT EXISTS public.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('jobseeker', 'recruiter', 'admin', 'expert_interviewer')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

-- No direct read/insert for anon or authenticated; only RPC can read
CREATE POLICY "No direct access to credentials"
ON public.credentials FOR ALL
TO public
USING (false)
WITH CHECK (false);

-- Test accounts: jobseeker + recruiter (change as needed; block after testing)
INSERT INTO public.credentials (email, password, role)
VALUES (
  'jobseeker1@provenhiretest.com',
  'TestJobSeeker1!',
  'jobseeker'
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  role = EXCLUDED.role;

INSERT INTO public.credentials (email, password, role)
VALUES (
  'recruiter1@provenhiretest.com',
  'TestRecruiter1!',
  'recruiter'
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  role = EXCLUDED.role;

-- RPC: validate email+password, return role for bypass login. Called by app before Supabase Auth.
CREATE OR REPLACE FUNCTION public.check_test_credentials(p_email text, p_password text)
RETURNS TABLE(ok boolean, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT true AS ok, c.role
  FROM public.credentials c
  WHERE LOWER(TRIM(c.email)) = LOWER(TRIM(p_email))
    AND c.password = p_password
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false AS ok, NULL::text AS role;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_test_credentials(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_test_credentials(text, text) TO authenticated;

COMMENT ON TABLE public.credentials IS 'Test-only: one row for bypass login. Remove or block after testing.';
