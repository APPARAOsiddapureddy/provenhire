-- Add recruiter-specific columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS designation text,
ADD COLUMN IF NOT EXISTS company_website text,
ADD COLUMN IF NOT EXISTS industry text,
ADD COLUMN IF NOT EXISTS hiring_for text,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- Create index for faster lookup of incomplete onboarding
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding ON public.profiles(user_id, onboarding_completed) WHERE onboarding_completed = false;