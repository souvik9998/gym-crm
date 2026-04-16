
-- 1. Create tenant-scoped staff phone lookup function
CREATE OR REPLACE FUNCTION public.get_staff_by_phone_in_tenant(p_phone text, p_tenant_id uuid)
RETURNS TABLE(staff_id uuid, full_name text, phone text, role text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT s.id, s.full_name, s.phone, s.role::text, s.is_active
  FROM public.staff s
  JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
  JOIN public.branches b ON sba.branch_id = b.id
  WHERE s.phone = p_phone AND b.tenant_id = p_tenant_id;
$$;

-- 2. Drop old global admin policy on staff
DROP POLICY IF EXISTS "Admins and super admins can manage staff" ON public.staff;

-- 3. Create tenant-scoped admin policy
CREATE POLICY "Admins can manage own tenant staff" ON public.staff
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.staff_branch_assignments sba
        JOIN public.branches b ON sba.branch_id = b.id
        JOIN public.tenant_members tm ON b.tenant_id = tm.tenant_id
        WHERE sba.staff_id = staff.id AND tm.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
