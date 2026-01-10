-- Create admin_activity_logs table for tracking all admin activities
CREATE TABLE public.admin_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID,
  activity_category TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  entity_name TEXT,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage admin activity logs" 
ON public.admin_activity_logs 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert admin activity logs" 
ON public.admin_activity_logs 
FOR INSERT 
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);
CREATE INDEX idx_admin_activity_logs_category ON public.admin_activity_logs(activity_category);
CREATE INDEX idx_admin_activity_logs_type ON public.admin_activity_logs(activity_type);

-- Add missing columns to whatsapp_notifications table for better tracking
ALTER TABLE public.whatsapp_notifications 
ADD COLUMN IF NOT EXISTS daily_pass_user_id UUID REFERENCES public.daily_pass_users(id),
ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
ADD COLUMN IF NOT EXISTS recipient_name TEXT,
ADD COLUMN IF NOT EXISTS message_content TEXT,
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_user_id UUID;