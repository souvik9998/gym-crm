CREATE OR REPLACE FUNCTION public.refresh_subscription_statuses()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.subscriptions
  SET status = CASE
    WHEN end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END,
  updated_at = NOW()
  WHERE status NOT IN ('inactive', 'paused')
  AND status IS DISTINCT FROM CASE
    WHEN end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END;
END;
$function$;