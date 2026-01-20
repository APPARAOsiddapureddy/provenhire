-- Create table for proctoring alerts (realtime notifications to admins)
CREATE TABLE public.proctoring_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  test_id UUID NOT NULL,
  test_type TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  message TEXT NOT NULL,
  violation_details JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proctoring_alerts ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert alerts (from client during test)
CREATE POLICY "Anyone can insert alerts" 
ON public.proctoring_alerts 
FOR INSERT 
WITH CHECK (true);

-- Recruiters/admins can view all alerts
CREATE POLICY "Recruiters can view alerts" 
ON public.proctoring_alerts 
FOR SELECT 
USING (is_recruiter(auth.uid()));

-- Recruiters can update alerts (mark as read)
CREATE POLICY "Recruiters can update alerts" 
ON public.proctoring_alerts 
FOR UPDATE 
USING (is_recruiter(auth.uid()));

-- Enable realtime for proctoring alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.proctoring_alerts;

-- Create table for candidate appeals
CREATE TABLE public.test_appeals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  test_id UUID NOT NULL,
  test_type TEXT NOT NULL,
  appeal_reason TEXT NOT NULL,
  supporting_evidence TEXT,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_response TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.test_appeals ENABLE ROW LEVEL SECURITY;

-- Job seekers can submit appeals for their own tests
CREATE POLICY "Job seekers can submit appeals" 
ON public.test_appeals 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND is_jobseeker(auth.uid()));

-- Job seekers can view their own appeals
CREATE POLICY "Job seekers can view their appeals" 
ON public.test_appeals 
FOR SELECT 
USING (auth.uid() = user_id AND is_jobseeker(auth.uid()));

-- Recruiters can view all appeals
CREATE POLICY "Recruiters can view all appeals" 
ON public.test_appeals 
FOR SELECT 
USING (is_recruiter(auth.uid()));

-- Recruiters can update appeals (respond/approve/reject)
CREATE POLICY "Recruiters can update appeals" 
ON public.test_appeals 
FOR UPDATE 
USING (is_recruiter(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_test_appeals_updated_at
BEFORE UPDATE ON public.test_appeals
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();