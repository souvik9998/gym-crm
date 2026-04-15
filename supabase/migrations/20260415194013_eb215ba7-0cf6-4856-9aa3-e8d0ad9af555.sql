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

  -- Only auto-calculate status for non-manual statuses
  NEW.status = CASE
    WHEN NEW.end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN NEW.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;