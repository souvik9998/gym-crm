-- Update auto-status trigger to recognize 'expiring_today'
CREATE OR REPLACE FUNCTION public.update_subscription_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Preserve manually set statuses (inactive, paused) - don't override them
  IF NEW.status IN ('inactive', 'paused') THEN
    NEW.updated_at = NOW();
    RETURN NEW;
  END IF;

  NEW.status = CASE
    WHEN NEW.end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN NEW.end_date = CURRENT_DATE THEN 'expiring_today'::subscription_status
    WHEN NEW.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Update bulk refresh to apply 'expiring_today' for end_date = today
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
    WHEN end_date = CURRENT_DATE THEN 'expiring_today'::subscription_status
    WHEN end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END,
  updated_at = NOW()
  WHERE status NOT IN ('inactive', 'paused')
  AND status IS DISTINCT FROM CASE
    WHEN end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN end_date = CURRENT_DATE THEN 'expiring_today'::subscription_status
    WHEN end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END;
END;
$function$;

-- Refresh now so today's expiring members get re-labeled
SELECT public.refresh_subscription_statuses();