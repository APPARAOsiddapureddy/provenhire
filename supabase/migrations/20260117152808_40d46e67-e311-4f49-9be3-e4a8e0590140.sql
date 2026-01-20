-- Create AI interview sessions table
CREATE TABLE public.ai_interview_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  total_questions INTEGER NOT NULL DEFAULT 5,
  questions_answered INTEGER NOT NULL DEFAULT 0,
  overall_score NUMERIC(5,2),
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create AI interview responses table
CREATE TABLE public.ai_interview_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.ai_interview_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  question_index INTEGER NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('behavioral', 'technical', 'situational')),
  question_text TEXT NOT NULL,
  audio_url TEXT,
  video_url TEXT,
  transcript TEXT,
  ai_score NUMERIC(5,2),
  ai_feedback TEXT,
  confidence_score NUMERIC(5,2),
  keywords_detected TEXT[],
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  response_duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_interview_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_interview_sessions
CREATE POLICY "Users can view their own sessions"
  ON public.ai_interview_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions"
  ON public.ai_interview_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON public.ai_interview_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sessions"
  ON public.ai_interview_sessions FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all sessions"
  ON public.ai_interview_sessions FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- RLS Policies for ai_interview_responses
CREATE POLICY "Users can view their own responses"
  ON public.ai_interview_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own responses"
  ON public.ai_interview_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all responses"
  ON public.ai_interview_responses FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all responses"
  ON public.ai_interview_responses FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Create indexes for performance
CREATE INDEX idx_ai_interview_sessions_user_id ON public.ai_interview_sessions(user_id);
CREATE INDEX idx_ai_interview_sessions_status ON public.ai_interview_sessions(status);
CREATE INDEX idx_ai_interview_sessions_flagged ON public.ai_interview_sessions(is_flagged) WHERE is_flagged = true;
CREATE INDEX idx_ai_interview_responses_session_id ON public.ai_interview_responses(session_id);
CREATE INDEX idx_ai_interview_responses_flagged ON public.ai_interview_responses(is_flagged) WHERE is_flagged = true;

-- Add trigger for updated_at
CREATE TRIGGER update_ai_interview_sessions_updated_at
  BEFORE UPDATE ON public.ai_interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create storage bucket for interview recordings
INSERT INTO storage.buckets (id, name, public) VALUES ('interview-recordings', 'interview-recordings', false);

-- Storage policies for interview recordings
CREATE POLICY "Users can upload their own interview recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'interview-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own interview recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'interview-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all interview recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'interview-recordings' AND public.is_admin(auth.uid()));