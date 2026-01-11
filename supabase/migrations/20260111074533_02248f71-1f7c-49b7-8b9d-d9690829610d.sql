-- Create user activity logs table for tracking member/user activities
CREATE TABLE public.user_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_type TEXT NOT NULL, -- registration, renewal, pt_extension, daily_pass, pt_subscription
  description TEXT NOT NULL,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  daily_pass_user_id UUID REFERENCES public.daily_pass_users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  pt_subscription_id UUID REFERENCES public.pt_subscriptions(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  trainer_id UUID REFERENCES public.personal_trainers(id) ON DELETE SET NULL,
  amount NUMERIC,
  payment_mode TEXT,
  package_name TEXT,
  duration_months INTEGER,
  duration_days INTEGER,
  member_name TEXT,
  member_phone TEXT,
  trainer_name TEXT,
  start_date DATE,
  end_date DATE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage user activity logs" 
ON public.user_activity_logs 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert user activity logs" 
ON public.user_activity_logs 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Public can view user activity logs" 
ON public.user_activity_logs 
FOR SELECT 
USING (true);

-- Add index for faster queries
CREATE INDEX idx_user_activity_logs_created_at ON public.user_activity_logs(created_at DESC);
CREATE INDEX idx_user_activity_logs_activity_type ON public.user_activity_logs(activity_type);
CREATE INDEX idx_user_activity_logs_member_id ON public.user_activity_logs(member_id);