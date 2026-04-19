-- Backfill current month's WhatsApp usage from whatsapp_notifications
WITH actual_sends AS (
  SELECT
    b.tenant_id,
    COUNT(*) AS sent_count
  FROM public.whatsapp_notifications wn
  JOIN public.branches b ON b.id = wn.branch_id
  WHERE wn.status = 'sent'
    AND wn.created_at >= date_trunc('month', CURRENT_DATE)
    AND b.tenant_id IS NOT NULL
  GROUP BY b.tenant_id
)
INSERT INTO public.tenant_usage (tenant_id, period_start, period_end, whatsapp_messages_sent)
SELECT
  a.tenant_id,
  date_trunc('month', CURRENT_DATE)::DATE,
  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
  a.sent_count
FROM actual_sends a
ON CONFLICT (tenant_id, period_start)
DO UPDATE SET
  whatsapp_messages_sent = GREATEST(EXCLUDED.whatsapp_messages_sent, public.tenant_usage.whatsapp_messages_sent),
  updated_at = now();