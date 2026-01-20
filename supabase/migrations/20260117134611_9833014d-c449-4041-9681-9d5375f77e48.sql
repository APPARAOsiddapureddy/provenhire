-- Fix function search_path for all custom functions
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id uuid)
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
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_roles.user_id = get_user_role.user_id LIMIT 1
$$;

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
      AND role = 'admin'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_recruiter(_user_id uuid)
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
      AND role = 'recruiter'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_jobseeker(_user_id uuid)
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
      AND role = 'jobseeker'::public.app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_id_from_referral_code(code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id
  FROM public.profiles p
  WHERE UPPER(SUBSTRING(p.user_id::text, 1, 8)) = UPPER(code)
  LIMIT 1
$$;

-- Fix overly permissive RLS policies on referrals table
DROP POLICY IF EXISTS "Service role can insert referrals" ON public.referrals;
DROP POLICY IF EXISTS "Service role can update referrals" ON public.referrals;

-- Create proper policies for referrals (only allow via authenticated edge functions)
CREATE POLICY "Authenticated users can insert referrals for themselves"
ON public.referrals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = referred_user_id);

CREATE POLICY "System can update referrals"
ON public.referrals
FOR UPDATE
TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

-- Fix newsletter_subscribers overly permissive policy
DROP POLICY IF EXISTS "Anyone can subscribe to newsletter" ON public.newsletter_subscribers;

-- Allow unauthenticated newsletter signups but with email validation
CREATE POLICY "Public can subscribe to newsletter"
ON public.newsletter_subscribers
FOR INSERT
TO anon, authenticated
WITH CHECK (email IS NOT NULL AND email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');