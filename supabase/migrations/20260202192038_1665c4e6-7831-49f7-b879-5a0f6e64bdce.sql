-- Fix Branch Isolation for Multi-Tenant SaaS
-- This ensures each gym owner only sees their own branches

-- Drop existing policies that are too permissive
DROP POLICY IF EXISTS "Anyone can view active non-deleted branches" ON branches;
DROP POLICY IF EXISTS "Admins can manage branches" ON branches;
DROP POLICY IF EXISTS "Admins can view all branches including deleted" ON branches;
DROP POLICY IF EXISTS "Tenant members can access their branches" ON branches;

-- Create new stricter policies

-- Super admins can do everything
CREATE POLICY "Super admins can manage all branches"
ON branches FOR ALL
USING (is_super_admin(auth.uid()));

-- Tenant members can manage their own branches
CREATE POLICY "Tenant members can manage own branches"
ON branches FOR ALL
USING (
  tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), tenant_id)
)
WITH CHECK (
  tenant_id IS NOT NULL AND user_belongs_to_tenant(auth.uid(), tenant_id)
);

-- Admins without tenant can manage branches without tenant (legacy support)
CREATE POLICY "Legacy admins can manage unassigned branches"
ON branches FOR ALL
USING (
  tenant_id IS NULL AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  tenant_id IS NULL AND has_role(auth.uid(), 'admin'::app_role)
);

-- Public can only view active branches (for registration pages)
-- This is needed for public registration flows
CREATE POLICY "Public can view active branches for registration"
ON branches FOR SELECT
USING (is_active = true AND deleted_at IS NULL);

-- Staff can view their assigned branches
CREATE POLICY "Staff can view assigned branches"
ON branches FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff s
    JOIN staff_branch_assignments sba ON s.id = sba.staff_id
    WHERE s.auth_user_id = auth.uid()
    AND s.is_active = true
    AND sba.branch_id = branches.id
  )
);