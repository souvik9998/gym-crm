-- ============================================================================
-- CRON JOB SETUP FOR DAILY WHATSAPP NOTIFICATIONS
-- 
-- Prerequisites:
-- 1. Enable pg_cron extension: Dashboard → Database → Extensions → pg_cron
-- 2. Enable pg_net extension: Dashboard → Database → Extensions → pg_net
-- 3. Replace YOUR_ANON_KEY with your project's anon key
-- ============================================================================

-- Schedule daily WhatsApp notifications at 9:00 AM IST (3:30 AM UTC)
SELECT cron.schedule(
  'daily-whatsapp-notifications',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ydswesigiavvgllqrbze.supabase.co/functions/v1/daily-whatsapp-job',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- VERIFY CRON JOB
-- ============================================================================

-- List all scheduled jobs:
-- SELECT * FROM cron.job;

-- View job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- ============================================================================
-- MANAGE CRON JOBS
-- ============================================================================

-- Unschedule a job:
-- SELECT cron.unschedule('daily-whatsapp-notifications');

-- Reschedule with different time:
-- SELECT cron.unschedule('daily-whatsapp-notifications');
-- SELECT cron.schedule('daily-whatsapp-notifications', '0 4 * * *', $$ ... $$);
