-- Add human-friendly public IDs for easier analysis and reporting

-- Helper to generate short, readable IDs with a prefix
CREATE OR REPLACE FUNCTION public.generate_public_id(prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  short_id TEXT;
BEGIN
  -- 8-char token derived from UUID
  short_id := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));
  RETURN prefix || '-' || short_id;
END;
$$;

-- user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.user_roles SET public_id = public.generate_public_id('UR') WHERE public_id IS NULL;
ALTER TABLE public.user_roles ALTER COLUMN public_id SET DEFAULT public.generate_public_id('UR');
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_public_id_key ON public.user_roles(public_id);

-- profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.profiles SET public_id = public.generate_public_id('PRO') WHERE public_id IS NULL;
ALTER TABLE public.profiles ALTER COLUMN public_id SET DEFAULT public.generate_public_id('PRO');
CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_key ON public.profiles(public_id);

-- job_seeker_profiles
ALTER TABLE public.job_seeker_profiles ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.job_seeker_profiles SET public_id = public.generate_public_id('JSP') WHERE public_id IS NULL;
ALTER TABLE public.job_seeker_profiles ALTER COLUMN public_id SET DEFAULT public.generate_public_id('JSP');
CREATE UNIQUE INDEX IF NOT EXISTS job_seeker_profiles_public_id_key ON public.job_seeker_profiles(public_id);

-- verification_stages
ALTER TABLE public.verification_stages ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.verification_stages SET public_id = public.generate_public_id('VS') WHERE public_id IS NULL;
ALTER TABLE public.verification_stages ALTER COLUMN public_id SET DEFAULT public.generate_public_id('VS');
CREATE UNIQUE INDEX IF NOT EXISTS verification_stages_public_id_key ON public.verification_stages(public_id);

-- jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.jobs SET public_id = public.generate_public_id('JOB') WHERE public_id IS NULL;
ALTER TABLE public.jobs ALTER COLUMN public_id SET DEFAULT public.generate_public_id('JOB');
CREATE UNIQUE INDEX IF NOT EXISTS jobs_public_id_key ON public.jobs(public_id);

-- job_applications
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.job_applications SET public_id = public.generate_public_id('APP') WHERE public_id IS NULL;
ALTER TABLE public.job_applications ALTER COLUMN public_id SET DEFAULT public.generate_public_id('APP');
CREATE UNIQUE INDEX IF NOT EXISTS job_applications_public_id_key ON public.job_applications(public_id);

-- saved_jobs
ALTER TABLE public.saved_jobs ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.saved_jobs SET public_id = public.generate_public_id('SAV') WHERE public_id IS NULL;
ALTER TABLE public.saved_jobs ALTER COLUMN public_id SET DEFAULT public.generate_public_id('SAV');
CREATE UNIQUE INDEX IF NOT EXISTS saved_jobs_public_id_key ON public.saved_jobs(public_id);

-- admin_messages
ALTER TABLE public.admin_messages ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.admin_messages SET public_id = public.generate_public_id('ADM') WHERE public_id IS NULL;
ALTER TABLE public.admin_messages ALTER COLUMN public_id SET DEFAULT public.generate_public_id('ADM');
CREATE UNIQUE INDEX IF NOT EXISTS admin_messages_public_id_key ON public.admin_messages(public_id);

-- aptitude_test_results
ALTER TABLE public.aptitude_test_results ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.aptitude_test_results SET public_id = public.generate_public_id('ATR') WHERE public_id IS NULL;
ALTER TABLE public.aptitude_test_results ALTER COLUMN public_id SET DEFAULT public.generate_public_id('ATR');
CREATE UNIQUE INDEX IF NOT EXISTS aptitude_test_results_public_id_key ON public.aptitude_test_results(public_id);

-- dsa_round_results
ALTER TABLE public.dsa_round_results ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.dsa_round_results SET public_id = public.generate_public_id('DSR') WHERE public_id IS NULL;
ALTER TABLE public.dsa_round_results ALTER COLUMN public_id SET DEFAULT public.generate_public_id('DSR');
CREATE UNIQUE INDEX IF NOT EXISTS dsa_round_results_public_id_key ON public.dsa_round_results(public_id);

-- proctoring_alerts
ALTER TABLE public.proctoring_alerts ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.proctoring_alerts SET public_id = public.generate_public_id('PRA') WHERE public_id IS NULL;
ALTER TABLE public.proctoring_alerts ALTER COLUMN public_id SET DEFAULT public.generate_public_id('PRA');
CREATE UNIQUE INDEX IF NOT EXISTS proctoring_alerts_public_id_key ON public.proctoring_alerts(public_id);

-- test_appeals
ALTER TABLE public.test_appeals ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.test_appeals SET public_id = public.generate_public_id('TAP') WHERE public_id IS NULL;
ALTER TABLE public.test_appeals ALTER COLUMN public_id SET DEFAULT public.generate_public_id('TAP');
CREATE UNIQUE INDEX IF NOT EXISTS test_appeals_public_id_key ON public.test_appeals(public_id);

-- ai_interview_sessions
ALTER TABLE public.ai_interview_sessions ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.ai_interview_sessions SET public_id = public.generate_public_id('AIS') WHERE public_id IS NULL;
ALTER TABLE public.ai_interview_sessions ALTER COLUMN public_id SET DEFAULT public.generate_public_id('AIS');
CREATE UNIQUE INDEX IF NOT EXISTS ai_interview_sessions_public_id_key ON public.ai_interview_sessions(public_id);

-- ai_interview_responses
ALTER TABLE public.ai_interview_responses ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.ai_interview_responses SET public_id = public.generate_public_id('AIR') WHERE public_id IS NULL;
ALTER TABLE public.ai_interview_responses ALTER COLUMN public_id SET DEFAULT public.generate_public_id('AIR');
CREATE UNIQUE INDEX IF NOT EXISTS ai_interview_responses_public_id_key ON public.ai_interview_responses(public_id);

-- newsletter_subscribers
ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.newsletter_subscribers SET public_id = public.generate_public_id('NWS') WHERE public_id IS NULL;
ALTER TABLE public.newsletter_subscribers ALTER COLUMN public_id SET DEFAULT public.generate_public_id('NWS');
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_public_id_key ON public.newsletter_subscribers(public_id);

-- job_alert_subscriptions
ALTER TABLE public.job_alert_subscriptions ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.job_alert_subscriptions SET public_id = public.generate_public_id('JAS') WHERE public_id IS NULL;
ALTER TABLE public.job_alert_subscriptions ALTER COLUMN public_id SET DEFAULT public.generate_public_id('JAS');
CREATE UNIQUE INDEX IF NOT EXISTS job_alert_subscriptions_public_id_key ON public.job_alert_subscriptions(public_id);

-- referrals
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE public.referrals SET public_id = public.generate_public_id('REF') WHERE public_id IS NULL;
ALTER TABLE public.referrals ALTER COLUMN public_id SET DEFAULT public.generate_public_id('REF');
CREATE UNIQUE INDEX IF NOT EXISTS referrals_public_id_key ON public.referrals(public_id);
