CREATE OR REPLACE FUNCTION public.staff_has_permission(_staff_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_permissions sp
    WHERE sp.staff_id = _staff_id
      AND (
        (_permission = 'view_members' AND sp.can_view_members = true) OR
        (_permission = 'manage_members' AND sp.can_manage_members = true) OR
        (_permission = 'access_ledger' AND sp.can_access_ledger = true) OR
        (_permission = 'access_payments' AND sp.can_access_payments = true) OR
        (_permission = 'access_analytics' AND sp.can_access_analytics = true) OR
        (_permission = 'change_settings' AND sp.can_change_settings = true) OR
        (_permission = 'manage_events' AND sp.can_manage_events = true)
      )
  )
$$;