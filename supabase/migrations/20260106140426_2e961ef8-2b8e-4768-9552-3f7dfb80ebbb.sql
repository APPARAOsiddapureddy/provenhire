-- Create admin_messages table for in-app messaging
CREATE TABLE public.admin_messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_id UUID NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own messages
CREATE POLICY "Users can view their own messages"
ON public.admin_messages
FOR SELECT
USING (auth.uid() = recipient_id);

-- Users can update their own messages (mark as read)
CREATE POLICY "Users can update their own messages"
ON public.admin_messages
FOR UPDATE
USING (auth.uid() = recipient_id);

-- Create aptitude_test_results table
CREATE TABLE public.aptitude_test_results (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0,
    verbal_score INTEGER NOT NULL DEFAULT 0,
    logical_score INTEGER NOT NULL DEFAULT 0,
    data_integrity_score INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 15,
    time_taken_seconds INTEGER,
    difficulty TEXT NOT NULL DEFAULT 'Easy',
    passed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    answers JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.aptitude_test_results ENABLE ROW LEVEL SECURITY;

-- Job seekers can insert their own results
CREATE POLICY "Job seekers can insert their test results"
ON public.aptitude_test_results
FOR INSERT
WITH CHECK (auth.uid() = user_id AND is_jobseeker(auth.uid()));

-- Job seekers can view their own results
CREATE POLICY "Job seekers can view their test results"
ON public.aptitude_test_results
FOR SELECT
USING (auth.uid() = user_id AND is_jobseeker(auth.uid()));

-- Create dsa_round_results table
CREATE TABLE public.dsa_round_results (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0,
    problems_attempted INTEGER NOT NULL DEFAULT 0,
    problems_solved INTEGER NOT NULL DEFAULT 0,
    time_taken_seconds INTEGER,
    difficulty TEXT NOT NULL DEFAULT 'Easy',
    passed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    solutions JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.dsa_round_results ENABLE ROW LEVEL SECURITY;

-- Job seekers can insert their own results
CREATE POLICY "Job seekers can insert their DSA results"
ON public.dsa_round_results
FOR INSERT
WITH CHECK (auth.uid() = user_id AND is_jobseeker(auth.uid()));

-- Job seekers can view their own results
CREATE POLICY "Job seekers can view their DSA results"
ON public.dsa_round_results
FOR SELECT
USING (auth.uid() = user_id AND is_jobseeker(auth.uid()));