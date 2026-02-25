-- PRD v4.1: Two tracks (Technical / Non-Technical), attempt counters, shortlisting, non-tech verification, job gates

-- 1) job_seeker_profiles: track, role_category, verified_at, reverification_due_at, non-tech fields
ALTER TABLE public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS track text DEFAULT 'tech',
  ADD COLUMN IF NOT EXISTS role_category text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS reverification_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS nontech_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS nontech_reverification_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS nontech_public_id text,
  ADD COLUMN IF NOT EXISTS nontech_public_url text;

COMMENT ON COLUMN public.job_seeker_profiles.track IS 'tech | non_tech';
COMMENT ON COLUMN public.job_seeker_profiles.role_category IS 'For non-tech: Marketing, Sales, Finance/Accounting, Operations/Business Analyst, Human Resources, Content/Copywriting';

-- 2) verification_stages: per-stage attempt counters and locks (PRD 3-attempt rule)
ALTER TABLE public.verification_stages
  ADD COLUMN IF NOT EXISTS stage_2_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_3_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_4_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stage_2_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stage_3_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stage_4_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stage_2_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_3_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS stage_4_last_attempt_at timestamptz;

-- 3) shortlist_results: Stage 4 → Stage 5 shortlisting (combined score >= 65%)
CREATE TABLE IF NOT EXISTS public.shortlist_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('SLR'),
  user_id uuid NOT NULL,
  stage_2_score_pct numeric,
  stage_3_score_pct numeric,
  stage_4_score_pct numeric,
  combined_score_pct numeric NOT NULL,
  shortlisted boolean NOT NULL DEFAULT false,
  threshold_pct numeric NOT NULL DEFAULT 65,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shortlist_results_public_id_key ON public.shortlist_results(public_id);
CREATE INDEX IF NOT EXISTS shortlist_results_user_id_idx ON public.shortlist_results(user_id);

ALTER TABLE public.shortlist_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own shortlist result" ON public.shortlist_results;
CREATE POLICY "Users can view own shortlist result"
ON public.shortlist_results FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service can insert shortlist result" ON public.shortlist_results;
CREATE POLICY "Service can insert shortlist result"
ON public.shortlist_results FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 4) nontech_verification: non-tech track Stage 2 AI interview state (max 2 attempts)
CREATE TABLE IF NOT EXISTS public.nontech_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('NTV'),
  user_id uuid NOT NULL UNIQUE,
  role_category text NOT NULL,
  ai_interview_attempts integer NOT NULL DEFAULT 0,
  ai_interview_score numeric,
  status text NOT NULL DEFAULT 'not_started',
  verified_at timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.nontech_verification.status IS 'not_started | in_progress | nontech_verified | nontech_reverification_due | nontech_locked';

CREATE UNIQUE INDEX IF NOT EXISTS nontech_verification_public_id_key ON public.nontech_verification(public_id);
CREATE INDEX IF NOT EXISTS nontech_verification_user_id_idx ON public.nontech_verification(user_id);

ALTER TABLE public.nontech_verification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own nontech verification" ON public.nontech_verification;
CREATE POLICY "Users can manage own nontech verification"
ON public.nontech_verification FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5) nontech_ai_interviews: per-attempt record (questions, answers, score, feedback)
CREATE TABLE IF NOT EXISTS public.nontech_ai_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('NAI'),
  user_id uuid NOT NULL,
  role_category text NOT NULL,
  attempt_number integer NOT NULL,
  questions jsonb,
  answers jsonb,
  score numeric,
  feedback_summary text,
  status text NOT NULL DEFAULT 'in_progress',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nontech_ai_interviews_public_id_key ON public.nontech_ai_interviews(public_id);
CREATE INDEX IF NOT EXISTS nontech_ai_interviews_user_id_idx ON public.nontech_ai_interviews(user_id);

ALTER TABLE public.nontech_ai_interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own nontech AI interviews" ON public.nontech_ai_interviews;
CREATE POLICY "Users can manage own nontech AI interviews"
ON public.nontech_ai_interviews FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 6) job_assignments: non-tech per-job assignment (LLM-generated, 48hr deadline, anti-fraud follow-up)
CREATE TABLE IF NOT EXISTS public.job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('JAS'),
  application_id uuid NOT NULL,
  job_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  questions jsonb,
  answers jsonb,
  followup_questions jsonb,
  followup_answers jsonb,
  ai_score numeric,
  score_breakdown jsonb,
  feedback_summary text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  fraud_flag boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  scored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.job_assignments.status IS 'pending | submitted | followup_pending | scoring | scored | expired';

CREATE UNIQUE INDEX IF NOT EXISTS job_assignments_public_id_key ON public.job_assignments(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS job_assignments_application_id_key ON public.job_assignments(application_id);
CREATE INDEX IF NOT EXISTS job_assignments_job_id_idx ON public.job_assignments(job_id);
CREATE INDEX IF NOT EXISTS job_assignments_candidate_id_idx ON public.job_assignments(candidate_id);

ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;

-- RLS: candidates see own; recruiters see via job_applications (handled by app or additional policy)
DROP POLICY IF EXISTS "Candidates can view own assignments" ON public.job_assignments;
CREATE POLICY "Candidates can view own assignments"
ON public.job_assignments FOR SELECT TO authenticated
USING (auth.uid() = candidate_id);

DROP POLICY IF EXISTS "Candidates can update own assignment answers" ON public.job_assignments;
CREATE POLICY "Candidates can update own assignment answers"
ON public.job_assignments FOR UPDATE TO authenticated
USING (auth.uid() = candidate_id)
WITH CHECK (auth.uid() = candidate_id);

-- 7) assignment_score_flags: recruiter flags assignment for admin review
CREATE TABLE IF NOT EXISTS public.assignment_score_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('ASF'),
  application_id uuid NOT NULL,
  recruiter_id uuid NOT NULL,
  reason text NOT NULL,
  admin_decision text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_score_flags_public_id_key ON public.assignment_score_flags(public_id);

ALTER TABLE public.assignment_score_flags ENABLE ROW LEVEL SECURITY;

-- 8) jobs: job_track, role_category, company_context, assignment_threshold
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_track text DEFAULT 'tech',
  ADD COLUMN IF NOT EXISTS role_category text,
  ADD COLUMN IF NOT EXISTS company_context text,
  ADD COLUMN IF NOT EXISTS assignment_threshold numeric DEFAULT 60;

COMMENT ON COLUMN public.jobs.job_track IS 'tech | non_technical';
COMMENT ON COLUMN public.jobs.role_category IS 'For non_technical: Marketing, Sales, Finance/Accounting, Operations/Business Analyst, Human Resources, Content/Copywriting';
COMMENT ON COLUMN public.jobs.company_context IS 'Brief description of what the company does; required for non-tech assignment generation';
COMMENT ON COLUMN public.jobs.assignment_threshold IS 'Min AI score to show assignment to recruiter; default 60';

-- 9) job_applications: ensure status supports non-tech lifecycle (assignment_pending, assignment_expired, followup_pending, scoring, auto_rejected, under_review, etc.)
-- No schema change needed if status is already text; application logic will use these values.

-- 10) reverification_schedule: both tracks annual re-verification
CREATE TABLE IF NOT EXISTS public.reverification_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text DEFAULT public.generate_public_id('RVS'),
  user_id uuid NOT NULL,
  track text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.reverification_schedule.track IS 'tech | non_tech';
COMMENT ON COLUMN public.reverification_schedule.status IS 'pending | scheduled | completed | failed';

CREATE UNIQUE INDEX IF NOT EXISTS reverification_schedule_public_id_key ON public.reverification_schedule(public_id);
CREATE INDEX IF NOT EXISTS reverification_schedule_user_id_idx ON public.reverification_schedule(user_id);
CREATE INDEX IF NOT EXISTS reverification_schedule_due_at_idx ON public.reverification_schedule(due_at);

ALTER TABLE public.reverification_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reverification schedule" ON public.reverification_schedule;
CREATE POLICY "Users can view own reverification schedule"
ON public.reverification_schedule FOR SELECT TO authenticated
USING (auth.uid() = user_id);
