-- Revert auto-status trigger to previous logic (no expiring_today branch)
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
    WHEN NEW.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Revert bulk refresh to previous logic
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

-- Move any rows currently labeled 'expiring_today' back to 'expiring_soon'
UPDATE public.subscriptions
SET status = 'expiring_soon'::subscription_status,
    updated_at = NOW()
WHERE status = 'expiring_today';