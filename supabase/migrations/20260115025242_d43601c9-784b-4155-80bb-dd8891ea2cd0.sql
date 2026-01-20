-- Create storage bucket for proctoring recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('proctoring-recordings', 'proctoring-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for proctoring recordings bucket
CREATE POLICY "Authenticated users can upload their own recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proctoring-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proctoring-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admin policy - for now we'll let authenticated users with specific checks
-- In production you'd want a proper admin role

-- Add invalidation columns to aptitude_test_results
ALTER TABLE public.aptitude_test_results 
ADD COLUMN IF NOT EXISTS is_invalidated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS invalidated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS invalidation_reason text,
ADD COLUMN IF NOT EXISTS screen_recording_url text;

-- Add invalidation columns to dsa_round_results
ALTER TABLE public.dsa_round_results 
ADD COLUMN IF NOT EXISTS is_invalidated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS invalidated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS invalidation_reason text,
ADD COLUMN IF NOT EXISTS screen_recording_url text;