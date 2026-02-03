-- Drop existing problematic policies for branches
DROP POLICY IF EXISTS "Gym owners can manage their branches" ON public.branches;
DROP POLICY IF EXISTS "Super admins can manage all branches" ON public.branches;
DROP POLICY IF EXISTS "super_admin_full_access_branches" ON public.branches;
DROP POLICY IF EXISTS "tenant_members_manage_own_branches" ON public.branches;
DROP POLICY IF EXISTS "staff_view_assigned_branches" ON public.branches;

-- Create clean, non-conflicting RLS policies for branches

-- 1. Super admins have full access to all branches (highest priority)
CREATE POLICY "super_admins_full_branch_access" ON public.branches
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. Gym owners (tenant admins) can manage their own tenant's branches
CREATE POLICY "gym_owners_manage_branches" ON public.branches
FOR ALL TO authenticated
USING (
  tenant_id IS NOT NULL 
  AND public.user_belongs_to_tenant(auth.uid(), tenant_id)
)
WITH CHECK (
  tenant_id IS NOT NULL 
  AND public.user_belongs_to_tenant(auth.uid(), tenant_id)
);

-- 3. Staff can only VIEW branches they are assigned to
CREATE POLICY "staff_view_branches" ON public.branches
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

-- 4. Allow public SELECT for branch-specific registration routes (via QR/links)
CREATE POLICY "public_view_active_branches" ON public.branches
FOR SELECT TO anon
USING (is_active = true AND deleted_at IS NULL);

-- Create optimized function for dashboard member counts (faster than multiple queries)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_members BIGINT,
  active_members BIGINT,
  expiring_soon BIGINT,
  expired_members BIGINT,
  inactive_members BIGINT,
  with_pt BIGINT,
  daily_pass_users BIGINT,
  monthly_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_expiry_threshold DATE := CURRENT_DATE + INTERVAL '7 days';
  v_month_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
BEGIN
  RETURN QUERY
  WITH member_stats AS (
    SELECT 
      m.id as member_id,
      s.status,
      s.end_date,
      s.id as subscription_id,
      ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY s.end_date DESC) as rn
    FROM public.members m
    LEFT JOIN public.subscriptions s ON s.member_id = m.id
    WHERE (_branch_id IS NULL OR m.branch_id = _branch_id)
  ),
  latest_subs AS (
    SELECT * FROM member_stats WHERE rn = 1
  )
  SELECT
    (SELECT COUNT(DISTINCT m.id) FROM public.members m WHERE _branch_id IS NULL OR m.branch_id = _branch_id)::BIGINT as total_members,
    (SELECT COUNT(*) FROM latest_subs WHERE status = 'active' AND end_date > v_today)::BIGINT as active_members,
    (SELECT COUNT(*) FROM latest_subs WHERE status = 'expiring_soon' OR (end_date <= v_expiry_threshold AND end_date >= v_today))::BIGINT as expiring_soon,
    (SELECT COUNT(*) FROM latest_subs WHERE (status = 'expired' OR end_date < v_today) AND status != 'inactive')::BIGINT as expired_members,
    (SELECT COUNT(*) FROM latest_subs WHERE status = 'inactive')::BIGINT as inactive_members,
    (SELECT COUNT(DISTINCT pt.member_id) 
     FROM public.pt_subscriptions pt 
     WHERE pt.status = 'active' 
       AND pt.end_date >= v_today
       AND (_branch_id IS NULL OR pt.branch_id = _branch_id))::BIGINT as with_pt,
    (SELECT COUNT(*) FROM public.daily_pass_users d WHERE _branch_id IS NULL OR d.branch_id = _branch_id)::BIGINT as daily_pass_users,
    COALESCE(
      (SELECT SUM(p.amount) 
       FROM public.payments p 
       WHERE p.status = 'success' 
         AND p.created_at >= v_month_start
         AND (_branch_id IS NULL OR p.branch_id = _branch_id)),
      0
    )::NUMERIC as monthly_revenue;
END;
$$;