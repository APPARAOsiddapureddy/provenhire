-- Allow Stage 5 (human_expert_interview) in verification_stages.
-- Fixes: new row violates check constraint "verification_stages_stage_name_check"

ALTER TABLE public.verification_stages
  DROP CONSTRAINT IF EXISTS verification_stages_stage_name_check;

ALTER TABLE public.verification_stages
  ADD CONSTRAINT verification_stages_stage_name_check
  CHECK (stage_name IN (
    'profile_setup',
    'aptitude_test',
    'dsa_round',
    'expert_interview',
    'human_expert_interview'
  ));
