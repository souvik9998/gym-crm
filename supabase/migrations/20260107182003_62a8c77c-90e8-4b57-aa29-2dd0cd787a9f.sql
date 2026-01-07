-- Create table to track WhatsApp notifications
CREATE TABLE public.whatsapp_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'expiring_7days', 'expiring_today', 'expired', 'manual', 'admin_summary'
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'pending'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_whatsapp_notifications_member_id ON public.whatsapp_notifications(member_id);
CREATE INDEX idx_whatsapp_notifications_sent_at ON public.whatsapp_notifications(sent_at);
CREATE INDEX idx_whatsapp_notifications_type_date ON public.whatsapp_notifications(notification_type, sent_at);

-- Enable RLS
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage whatsapp notifications"
ON public.whatsapp_notifications
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert notifications"
ON public.whatsapp_notifications
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can view notifications"
ON public.whatsapp_notifications
FOR SELECT
USING (true);

-- Create table to track admin summary notifications (to avoid sending duplicates)
CREATE TABLE public.admin_summary_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  summary_type TEXT NOT NULL, -- 'daily_expiring', 'expired_members'
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_summary_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_summary_log
CREATE POLICY "Admins can manage admin summary log"
ON public.admin_summary_log
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert admin summary log"
ON public.admin_summary_log
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can view admin summary log"
ON public.admin_summary_log
FOR SELECT
USING (true);