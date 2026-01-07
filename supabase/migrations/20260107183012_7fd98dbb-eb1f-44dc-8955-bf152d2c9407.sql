-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule daily WhatsApp job at 11 AM IST (5:30 AM UTC)
-- The job calls the edge function via pg_net
SELECT cron.schedule(
  'daily-whatsapp-reminders',
  '30 5 * * *',  -- 5:30 AM UTC = 11:00 AM IST
  $$
  SELECT net.http_post(
    url := 'https://nhfghwwpnqoayhsitqmp.supabase.co/functions/v1/daily-whatsapp-job',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZmdod3dwbnFvYXloc2l0cW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDExNTEsImV4cCI6MjA4MzExNzE1MX0.QMq4tpsNiKxX5lT4eyfMrNT6OtnPsm_CouOowDA5m1g'
    ),
    body := '{}'::jsonb
  );
  $$
);