-- Backfill: link each existing expired_reminder / expiring_2days log to the most recent subscription
-- of that member that existed at or before the notification time. Best-effort.
WITH ranked AS (
  SELECT n.id AS notif_id,
         s.id AS sub_id,
         ROW_NUMBER() OVER (
           PARTITION BY n.id
           ORDER BY s.end_date DESC
         ) AS rn
  FROM public.whatsapp_notifications n
  JOIN public.subscriptions s
    ON s.member_id = n.member_id
   AND (n.branch_id IS NULL OR s.branch_id = n.branch_id)
  WHERE n.subscription_id IS NULL
    AND n.notification_type IN ('expired_reminder', 'expiring_2days', 'expiring_today')
)
UPDATE public.whatsapp_notifications n
SET subscription_id = r.sub_id
FROM ranked r
WHERE r.notif_id = n.id AND r.rn = 1;