CREATE OR REPLACE FUNCTION public.refresh_subscription_statuses()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = CASE
    WHEN end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END,
  updated_at = NOW()
  WHERE status IS DISTINCT FROM CASE
    WHEN end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_subscription_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.status = CASE
    WHEN NEW.end_date < CURRENT_DATE THEN 'expired'::subscription_status
    WHEN NEW.end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'expiring_soon'::subscription_status
    ELSE 'active'::subscription_status
  END;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;