-- Assign admin role to user souvik9998@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('f8e44bf0-8634-4766-9113-9d7c2981bfe7', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create function to refresh subscription statuses based on current date
CREATE OR REPLACE FUNCTION public.refresh_subscription_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE subscriptions 
  SET updated_at = NOW()
  WHERE (
    (status = 'active' AND end_date < CURRENT_DATE) OR
    (status = 'active' AND end_date <= CURRENT_DATE + INTERVAL '7 days' AND status != 'expiring_soon') OR
    (status IN ('expiring_soon', 'expired') AND end_date > CURRENT_DATE + INTERVAL '7 days')
  );
END;
$$;