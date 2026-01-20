-- Create storage bucket for resumes
INSERT INTO storage.buckets (id, name, public) 
VALUES ('resumes', 'resumes', false);

-- Storage policies for resumes bucket
CREATE POLICY "Users can upload their own resume"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own resume"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Recruiters can view resumes"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'resumes' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'recruiter'
  )
);

-- Job seeker profiles table
CREATE TABLE public.job_seeker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  resume_url text,
  college text,
  graduation_year integer,
  experience_years integer,
  skills text[],
  actively_looking_roles text[],
  projects jsonb DEFAULT '[]'::jsonb,
  hobbies text[],
  bio text,
  phone text,
  location text,
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'in_progress', 'verified', 'rejected')),
  profile_views integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.job_seeker_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own job seeker profile"
ON public.job_seeker_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own job seeker profile"
ON public.job_seeker_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job seeker profile"
ON public.job_seeker_profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Recruiters can view job seeker profiles"
ON public.job_seeker_profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'recruiter'
  )
);

-- Verification stages table
CREATE TABLE public.verification_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stage_name text NOT NULL CHECK (stage_name IN ('profile_setup', 'aptitude_test', 'dsa_round', 'expert_interview')),
  status text DEFAULT 'locked' CHECK (status IN ('locked', 'in_progress', 'completed', 'failed')),
  score integer,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, stage_name)
);

ALTER TABLE public.verification_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verification stages"
ON public.verification_stages FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own verification stages"
ON public.verification_stages FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own verification stages"
ON public.verification_stages FOR UPDATE
USING (auth.uid() = user_id);

-- Jobs table
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  description text,
  location text,
  salary_range text,
  required_skills text[],
  experience_required integer,
  job_type text CHECK (job_type IN ('full-time', 'part-time', 'contract', 'internship')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active jobs"
ON public.jobs FOR SELECT
USING (status = 'active');

CREATE POLICY "Recruiters can manage their own jobs"
ON public.jobs FOR ALL
USING (auth.uid() = recruiter_id);

-- Job applications table
CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  job_seeker_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  resume_url text NOT NULL,
  status text DEFAULT 'applied' CHECK (status IN ('applied', 'reviewed', 'shortlisted', 'interview_scheduled', 'rejected', 'accepted')),
  cover_letter text,
  applied_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(job_id, job_seeker_id)
);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job seekers can view their own applications"
ON public.job_applications FOR SELECT
USING (auth.uid() = job_seeker_id);

CREATE POLICY "Job seekers can create applications"
ON public.job_applications FOR INSERT
WITH CHECK (auth.uid() = job_seeker_id);

CREATE POLICY "Recruiters can view applications for their jobs"
ON public.job_applications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_applications.job_id AND jobs.recruiter_id = auth.uid()
  )
);

CREATE POLICY "Recruiters can update applications for their jobs"
ON public.job_applications FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_applications.job_id AND jobs.recruiter_id = auth.uid()
  )
);

-- Triggers for updated_at
CREATE TRIGGER update_job_seeker_profiles_updated_at
BEFORE UPDATE ON public.job_seeker_profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_verification_stages_updated_at
BEFORE UPDATE ON public.verification_stages
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_job_applications_updated_at
BEFORE UPDATE ON public.job_applications
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();