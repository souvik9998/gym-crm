CREATE OR REPLACE FUNCTION public.get_branch_staff_basic(p_branch_id uuid)
RETURNS TABLE(staff_id uuid, phone text, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.phone, s.full_name
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
  WHERE sba.branch_id = p_branch_id AND s.is_active = true;
$$;