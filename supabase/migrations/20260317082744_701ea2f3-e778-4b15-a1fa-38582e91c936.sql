CREATE OR REPLACE FUNCTION public.update_subscription_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If status is explicitly set to 'inactive' (manual deactivation), preserve it
  IF NEW.status = 'inactive' AND (OLD.status IS DISTINCT FROM 'inactive') THEN
    NEW.updated_at = NOW();
    RETURN NEW;
  END IF;

  -- If already inactive and only updated_at changed, keep inactive
  IF OLD.status = 'inactive' AND NEW.status = 'inactive' THEN
    NEW.updated_at = NOW();
    RETURN NEW;
  END IF;

  -- Auto-calculate status based on end_date for non-inactive subscriptions
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