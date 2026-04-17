-- Helper RPC: returns id + full_name for staff in a branch.
-- SECURITY DEFINER bypasses RLS so any authenticated user (admin or staff)
-- can resolve trainer names without exposing other staff fields (phone, email, password, etc.).
-- This is non-sensitive data already shown publicly in time-slot UIs.

CREATE OR REPLACE FUNCTION public.get_staff_names_for_branch(_branch_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.id, s.full_name
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON sba.staff_id = s.id
  WHERE sba.branch_id = _branch_id
    AND s.is_active = true
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_names_for_branch(uuid) TO authenticated;