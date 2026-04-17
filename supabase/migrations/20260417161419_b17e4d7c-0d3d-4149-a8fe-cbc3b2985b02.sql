-- Helper 1: tenant of the current auth user's staff record (derived via branch assignment)
CREATE OR REPLACE FUNCTION public.get_current_staff_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.tenant_id
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON sba.staff_id = s.id
  JOIN public.branches b ON b.id = sba.branch_id
  WHERE s.auth_user_id = auth.uid()
    AND s.is_active = true
  LIMIT 1
$$;

-- Helper 2: branch IDs the current auth user's staff record is assigned to
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
  WHERE s.auth_user_id = auth.uid()
    AND s.is_active = true
$$;

-- Helper 3: does the current auth user's staff record have member_access_type = 'all'?
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

-- Additive RLS policy: all-access staff can SELECT colleagues sharing a branch within the same tenant.
-- Tenant isolation is enforced via the target staff's branch assignment (since public.staff has no tenant_id column).
DROP POLICY IF EXISTS "Staff with all-access can view branch colleagues" ON public.staff;

CREATE POLICY "Staff with all-access can view branch colleagues"
ON public.staff
FOR SELECT
TO authenticated
USING (
  public.current_staff_has_all_member_access()
  AND staff.is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.staff_branch_assignments tb
    JOIN public.branches b ON b.id = tb.branch_id
    WHERE tb.staff_id = staff.id
      AND b.tenant_id = public.get_current_staff_tenant_id()  -- tenant isolation
      AND tb.branch_id IN (SELECT public.get_current_staff_branch_ids())  -- shared branch only
  )
);