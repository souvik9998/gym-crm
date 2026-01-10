-- Update the trigger function to also handle inactive status (expired > 30 days)
CREATE OR REPLACE FUNCTION public.update_subscription_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If expired for more than 30 days, mark as inactive
  IF NEW.end_date < CURRENT_DATE - INTERVAL '30 days' THEN
    NEW.status = 'inactive';
  ELSIF NEW.end_date < CURRENT_DATE THEN
    NEW.status = 'expired';
  ELSIF NEW.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN
    NEW.status = 'expiring_soon';
  ELSE
    NEW.status = 'active';
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Update refresh function to also handle inactive members
CREATE OR REPLACE FUNCTION public.refresh_subscription_statuses()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- First mark members as inactive if expired > 30 days
  UPDATE subscriptions 
  SET status = 'inactive', updated_at = NOW()
  WHERE end_date < CURRENT_DATE - INTERVAL '30 days'
    AND status != 'inactive';
    
  -- Then update other statuses
  UPDATE subscriptions 
  SET updated_at = NOW()
  WHERE (
    (status = 'active' AND end_date < CURRENT_DATE) OR
    (status = 'active' AND end_date <= CURRENT_DATE + INTERVAL '7 days' AND status != 'expiring_soon') OR
    (status IN ('expiring_soon', 'expired') AND end_date > CURRENT_DATE + INTERVAL '7 days')
  );
END;
$function$;