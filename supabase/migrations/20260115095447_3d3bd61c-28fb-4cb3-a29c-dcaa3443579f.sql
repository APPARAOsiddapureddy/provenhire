-- Add referral tracking columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referred_by_code TEXT,
ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS referral_verified_count INTEGER DEFAULT 0;

-- Create referrals tracking table
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'verified', 'rewarded')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(referred_user_id)
);

-- Enable RLS on referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Policies for referrals table
CREATE POLICY "Users can view their own referrals" 
ON public.referrals 
FOR SELECT 
USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

CREATE POLICY "Service role can insert referrals" 
ON public.referrals 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can update referrals" 
ON public.referrals 
FOR UPDATE 
USING (true);

-- Function to extract user id from referral code
CREATE OR REPLACE FUNCTION public.get_user_id_from_referral_code(code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_uuid UUID;
  short_id TEXT;
BEGIN
  -- Extract the 8-character short id from code like PH-XXXXXXXX
  IF code IS NULL OR LENGTH(code) < 11 OR NOT code LIKE 'PH-%' THEN
    RETURN NULL;
  END IF;
  
  short_id := LOWER(SUBSTRING(code FROM 4 FOR 8));
  
  -- Find user whose id starts with this prefix
  SELECT id INTO user_uuid 
  FROM auth.users 
  WHERE LOWER(SUBSTRING(id::TEXT FROM 1 FOR 8)) = short_id
  LIMIT 1;
  
  RETURN user_uuid;
END;
$$;