-- Clean up duplicate/conflicting policies first
DROP POLICY IF EXISTS "Gym owners can manage their branches" ON public.branches;
DROP POLICY IF EXISTS "Super admins can manage all branches" ON public.branches;
DROP POLICY IF EXISTS "super_admin_full_access_branches" ON public.branches;
DROP POLICY IF EXISTS "tenant_members_manage_own_branches" ON public.branches;
DROP POLICY IF EXISTS "staff_view_assigned_branches" ON public.branches;
DROP POLICY IF EXISTS "super_admins_full_branch_access" ON public.branches;
DROP POLICY IF EXISTS "gym_owners_manage_branches" ON public.branches;
DROP POLICY IF EXISTS "staff_view_branches" ON public.branches;
DROP POLICY IF EXISTS "public_view_active_branches" ON public.branches;

-- Recreate clean RLS policies with unique names

-- 1. Super admins have full access to all branches
CREATE POLICY "branches_super_admin_full_access" ON public.branches
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. Gym owners can manage their tenant's branches
CREATE POLICY "branches_gym_owner_manage" ON public.branches
FOR ALL TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND public.user_belongs_to_tenant(auth.uid(), tenant_id)
)
WITH CHECK (
  tenant_id IS NOT NULL 
  AND public.user_belongs_to_tenant(auth.uid(), tenant_id)
);

-- 3. Staff can view branches they are assigned to
CREATE POLICY "branches_staff_view" ON public.branches
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid() 
      AND s.is_active = true 
      AND sba.branch_id = branches.id
  )
);

-- 4. Allow public (anon) to view active branches for registration
CREATE POLICY "branches_public_view" ON public.branches
FOR SELECT TO anon
USING (is_active = true AND deleted_at IS NULL);