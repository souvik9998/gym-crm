ALTER TABLE public.whatsapp_notifications
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS status_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_provider_msg
  ON public.whatsapp_notifications (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_reconcile
  ON public.whatsapp_notifications (status, provider, sent_at)
  WHERE provider_message_id IS NOT NULL AND status = 'sent';
