-- Per-branch reminder time (local clock, IST)
ALTER TABLE public.gym_settings
  ADD COLUMN IF NOT EXISTS reminder_time TIME NOT NULL DEFAULT '09:00:00';

-- Tenant-wide kill switch for the QStash scheduler
ALTER TABLE public.tenant_messaging_config
  ADD COLUMN IF NOT EXISTS qstash_scheduler_enabled BOOLEAN NOT NULL DEFAULT true;