-- PRD v3.0: Stage 5 Human Expert Interview scheduling + data model

-- 1) Expand app_role enum to include expert interviewers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
      AND e.enumlabel = 'expert_interviewer'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'expert_interviewer';
  END IF;
END $$;

-- 2) Extend job_seeker_profiles for PRD lifecycle + passport fields
ALTER TABLE public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS verification_tier text,
  ADD COLUMN IF NOT EXISTS verification_level text,
  ADD COLUMN IF NOT EXISTS verification_public_id text,
  ADD COLUMN IF NOT EXISTS verification_public_url text;

-- 3) Jobs: backend gate field (standard vs premium)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS verification_required text DEFAULT 'standard';

-- 4) Expert interviewers
CREATE TABLE IF NOT EXISTS public.expert_interviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('EXP'),
  user_id uuid UNIQUE,
  name text,
  domain text,
  years_of_experience integer,
  linkedin_url text,
  verified_by_admin boolean NOT NULL DEFAULT false,
  nda_signed_at timestamptz,
  rating numeric,
  total_interviews_conducted integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS expert_interviewers_public_id_key ON public.expert_interviewers(public_id);

-- 5) Interviewer slots
CREATE TABLE IF NOT EXISTS public.interviewer_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('SLOT'),
  interviewer_id uuid NOT NULL REFERENCES public.expert_interviewers(id) ON DELETE CASCADE,
  domain text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'available', -- available | booked | cancelled
  booked_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS interviewer_slots_public_id_key ON public.interviewer_slots(public_id);
CREATE INDEX IF NOT EXISTS interviewer_slots_starts_at_idx ON public.interviewer_slots(starts_at);
CREATE INDEX IF NOT EXISTS interviewer_slots_status_idx ON public.interviewer_slots(status);

-- 6) Stage 5 sessions
CREATE TABLE IF NOT EXISTS public.human_interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('HIS'),
  user_id uuid NOT NULL,
  interviewer_id uuid NOT NULL REFERENCES public.expert_interviewers(id) ON DELETE RESTRICT,
  role_type text,
  verification_tier text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  score_breakdown jsonb,
  weighted_score numeric,
  verification_level text,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled | no_show | fraud_flagged
  fraud_flag boolean NOT NULL DEFAULT false,
  fraud_notes text,
  recording_url text,
  transcript text,
  interviewer_notes text,
  admin_review_status text NOT NULL DEFAULT 'not_required',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS human_interview_sessions_public_id_key ON public.human_interview_sessions(public_id);
CREATE INDEX IF NOT EXISTS human_interview_sessions_user_id_idx ON public.human_interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS human_interview_sessions_status_idx ON public.human_interview_sessions(status);

-- 7) RLS
ALTER TABLE public.expert_interviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviewer_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_interview_sessions ENABLE ROW LEVEL SECURITY;

-- expert_interviewers: authenticated can view only verified+active experts (for slot discovery)
DROP POLICY IF EXISTS "Authenticated can view verified experts" ON public.expert_interviewers;
CREATE POLICY "Authenticated can view verified experts"
ON public.expert_interviewers
FOR SELECT
TO authenticated
USING (verified_by_admin = true AND status = 'active');

-- interviewer_slots: authenticated can view available slots; can book (update) available slots into booked for themselves
DROP POLICY IF EXISTS "Authenticated can view available slots" ON public.interviewer_slots;
CREATE POLICY "Authenticated can view available slots"
ON public.interviewer_slots
FOR SELECT
TO authenticated
USING (status = 'available' AND starts_at > now());

DROP POLICY IF EXISTS "Authenticated can book available slot" ON public.interviewer_slots;
CREATE POLICY "Authenticated can book available slot"
ON public.interviewer_slots
FOR UPDATE
TO authenticated
USING (status = 'available' AND booked_user_id IS NULL)
WITH CHECK (status = 'booked' AND booked_user_id = auth.uid());

-- human_interview_sessions: candidate can read/insert own sessions
DROP POLICY IF EXISTS "Users can view their human interview sessions" ON public.human_interview_sessions;
CREATE POLICY "Users can view their human interview sessions"
ON public.human_interview_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their human interview session" ON public.human_interview_sessions;
CREATE POLICY "Users can create their human interview session"
ON public.human_interview_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

