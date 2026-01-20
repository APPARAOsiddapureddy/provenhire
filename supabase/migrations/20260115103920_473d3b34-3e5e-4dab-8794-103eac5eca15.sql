-- Create job alert subscriptions table
CREATE TABLE public.job_alert_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  min_match_percentage INT NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
  last_sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_frequency CHECK (frequency IN ('immediate', 'daily', 'weekly'))
);

-- Enable RLS
ALTER TABLE public.job_alert_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own subscriptions" 
ON public.job_alert_subscriptions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subscriptions" 
ON public.job_alert_subscriptions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" 
ON public.job_alert_subscriptions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions" 
ON public.job_alert_subscriptions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_job_alert_subscriptions_updated_at
BEFORE UPDATE ON public.job_alert_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();