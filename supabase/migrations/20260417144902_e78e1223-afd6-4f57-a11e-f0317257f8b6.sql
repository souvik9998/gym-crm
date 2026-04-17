-- Helper: branches the current auth user's staff record is assigned to
CREATE OR REPLACE FUNCTION public.get_current_staff_branch_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sba.branch_id
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON sba.staff_id = s.id
  WHERE s.auth_user_id = auth.uid() AND s.is_active = true
$$;

-- Helper: does the current auth user's staff record have member_access_type = 'all'?
CREATE OR REPLACE FUNCTION public.current_staff_has_all_member_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.staff_permissions sp ON sp.staff_id = s.id
    WHERE s.auth_user_id = auth.uid()
      AND s.is_active = true
      AND sp.member_access_type = 'all'
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_current_staff_branch_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_has_all_member_access() TO authenticated;

-- Drop policy if it exists (idempotent)
DROP POLICY IF EXISTS "Staff with all-access can view branch colleagues" ON public.staff;

-- Additive policy: staff with all-access can see colleagues in shared branches
CREATE POLICY "Staff with all-access can view branch colleagues"
ON public.staff
FOR SELECT
TO authenticated
USING (
  public.current_staff_has_all_member_access()
  AND EXISTS (
    SELECT 1
    FROM public.staff_branch_assignments tb
    WHERE tb.staff_id = staff.id
      AND tb.branch_id IN (SELECT public.get_current_staff_branch_ids())
  )
);