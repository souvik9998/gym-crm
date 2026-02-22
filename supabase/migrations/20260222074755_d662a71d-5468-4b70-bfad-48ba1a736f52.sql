
-- Add whatsapp_auto_send JSONB column to gym_settings
ALTER TABLE public.gym_settings
ADD COLUMN whatsapp_auto_send jsonb NOT NULL DEFAULT '{
  "new_registration": true,
  "renewal": true,
  "daily_pass": true,
  "pt_extension": true,
  "expiring_2days": true,
  "expiring_today": true,
  "expired_reminder": false,
  "payment_details": false,
  "admin_add_member": true
}'::jsonb;
