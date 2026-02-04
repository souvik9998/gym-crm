-- ============================================================
-- Security Enhancement: Fix Permissive RLS Policies
-- ============================================================

-- 1. Fix overly permissive RLS policies on staff_sessions
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Public can view staff sessions" ON public.staff_sessions;
DROP POLICY IF EXISTS "Public can update staff sessions" ON public.staff_sessions;
DROP POLICY IF EXISTS "Staff can access own sessions" ON public.staff_sessions;
DROP POLICY IF EXISTS "Service role can manage sessions" ON public.staff_sessions;

-- Create properly scoped policies for staff_sessions
CREATE POLICY "Staff can view own sessions via auth" ON public.staff_sessions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_sessions.staff_id
    AND s.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all staff sessions" ON public.staff_sessions
FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Service role has full access to staff sessions" ON public.staff_sessions
FOR ALL USING (auth.role() = 'service_role');

-- 2. Fix staff_login_attempts - remove public SELECT
DROP POLICY IF EXISTS "Public can view login attempts" ON public.staff_login_attempts;
DROP POLICY IF EXISTS "Admins can view login attempts" ON public.staff_login_attempts;
DROP POLICY IF EXISTS "Service role can insert login attempts" ON public.staff_login_attempts;
DROP POLICY IF EXISTS "Service role can manage login attempts" ON public.staff_login_attempts;

-- Only admins and super admins can view login attempts (for audit purposes)
CREATE POLICY "Admins can view login attempts" ON public.staff_login_attempts
FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Service role can insert/update login attempts (used by edge functions)
CREATE POLICY "Service role has full access to login attempts" ON public.staff_login_attempts
FOR ALL USING (auth.role() = 'service_role');

-- 3. Fix staff_permissions public SELECT
DROP POLICY IF EXISTS "Public can view staff permissions" ON public.staff_permissions;
DROP POLICY IF EXISTS "Anyone can view staff permissions" ON public.staff_permissions;

-- Staff can only view their own permissions (via auth.uid())
-- This policy may already exist, but we ensure it's properly defined
DROP POLICY IF EXISTS "Staff can view own permissions via auth" ON public.staff_permissions;
CREATE POLICY "Staff can view own permissions via auth" ON public.staff_permissions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_permissions.staff_id
    AND s.auth_user_id = auth.uid()
  )
);

-- Admins can view all staff permissions
DROP POLICY IF EXISTS "Admins can view all staff permissions" ON public.staff_permissions;
CREATE POLICY "Admins can view all staff permissions" ON public.staff_permissions
FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Service role has full access (for edge functions)
DROP POLICY IF EXISTS "Service role has full access to staff permissions" ON public.staff_permissions;
CREATE POLICY "Service role has full access to staff permissions" ON public.staff_permissions
FOR ALL USING (auth.role() = 'service_role');

-- 4. Fix staff_branch_assignments public SELECT
DROP POLICY IF EXISTS "Public can view branch assignments" ON public.staff_branch_assignments;
DROP POLICY IF EXISTS "Anyone can view branch assignments" ON public.staff_branch_assignments;

-- Staff can only view their own branch assignments
DROP POLICY IF EXISTS "Staff can view own branch assignments via auth" ON public.staff_branch_assignments;
CREATE POLICY "Staff can view own branch assignments via auth" ON public.staff_branch_assignments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_branch_assignments.staff_id
    AND s.auth_user_id = auth.uid()
  )
);

-- Admins can view all branch assignments within their tenant
DROP POLICY IF EXISTS "Admins can view branch assignments" ON public.staff_branch_assignments;
CREATE POLICY "Admins can view branch assignments" ON public.staff_branch_assignments
FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Service role has full access (for edge functions)
DROP POLICY IF EXISTS "Service role has full access to branch assignments" ON public.staff_branch_assignments;
CREATE POLICY "Service role has full access to branch assignments" ON public.staff_branch_assignments
FOR ALL USING (auth.role() = 'service_role');

-- 5. Ensure staff table has proper service role policy
DROP POLICY IF EXISTS "Service role has full access to staff" ON public.staff;
CREATE POLICY "Service role has full access to staff" ON public.staff
FOR ALL USING (auth.role() = 'service_role');