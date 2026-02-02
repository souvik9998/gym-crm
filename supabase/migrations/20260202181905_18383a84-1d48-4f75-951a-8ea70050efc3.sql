-- =====================================================
-- MULTI-TENANT SAAS ARCHITECTURE - PHASE 1C
-- Security Functions and RLS Policies
-- =====================================================

-- 1. Check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = 'super_admin'
    )
$$;

-- 2. Get user's tenant_id (returns first/primary tenant)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.tenant_members
    WHERE user_id = _user_id
    ORDER BY is_owner DESC, created_at ASC
    LIMIT 1
$$;

-- 3. Check if user belongs to tenant
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = _user_id AND tenant_id = _tenant_id
    )
$$;

-- 4. Check if user is tenant admin
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = _user_id 
          AND tenant_id = _tenant_id 
          AND role IN ('tenant_admin', 'admin')
    )
$$;

-- 5. Get current usage for a tenant
CREATE OR REPLACE FUNCTION public.get_tenant_current_usage(_tenant_id UUID)
RETURNS TABLE(
    branches_count BIGINT,
    staff_count BIGINT,
    members_count BIGINT,
    trainers_count BIGINT,
    whatsapp_this_month BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.branches WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND is_active = true)::BIGINT,
        (SELECT COUNT(*) FROM public.staff s 
         JOIN public.staff_branch_assignments sba ON s.id = sba.staff_id
         JOIN public.branches b ON sba.branch_id = b.id
         WHERE b.tenant_id = _tenant_id AND s.is_active = true)::BIGINT,
        (SELECT COUNT(*) FROM public.members m
         JOIN public.branches b ON m.branch_id = b.id
         WHERE b.tenant_id = _tenant_id)::BIGINT,
        (SELECT COUNT(*) FROM public.personal_trainers pt
         JOIN public.branches b ON pt.branch_id = b.id
         WHERE b.tenant_id = _tenant_id AND pt.is_active = true)::BIGINT,
        COALESCE((SELECT tu.whatsapp_messages_sent FROM public.tenant_usage tu
         WHERE tu.tenant_id = _tenant_id AND tu.period_start = v_month_start), 0)::BIGINT;
END;
$$;

-- 6. Check if tenant can add resource (limit enforcement)
CREATE OR REPLACE FUNCTION public.tenant_can_add_resource(
    _tenant_id UUID,
    _resource_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limits RECORD;
    v_usage RECORD;
BEGIN
    SELECT * INTO v_limits FROM public.tenant_limits WHERE tenant_id = _tenant_id;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    SELECT * INTO v_usage FROM public.get_tenant_current_usage(_tenant_id);
    
    CASE _resource_type
        WHEN 'branch' THEN
            RETURN v_usage.branches_count < v_limits.max_branches;
        WHEN 'staff' THEN
            RETURN v_usage.staff_count < (v_limits.max_staff_per_branch * v_limits.max_branches);
        WHEN 'member' THEN
            RETURN v_usage.members_count < v_limits.max_members;
        WHEN 'trainer' THEN
            RETURN v_usage.trainers_count < v_limits.max_trainers;
        WHEN 'whatsapp' THEN
            RETURN COALESCE(v_usage.whatsapp_this_month, 0) < v_limits.max_monthly_whatsapp_messages;
        ELSE
            RETURN false;
    END CASE;
END;
$$;

-- 7. Increment WhatsApp usage counter
CREATE OR REPLACE FUNCTION public.increment_whatsapp_usage(_tenant_id UUID, _count INTEGER DEFAULT 1)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
    v_month_end DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
    INSERT INTO public.tenant_usage (tenant_id, period_start, period_end, whatsapp_messages_sent)
    VALUES (_tenant_id, v_month_start, v_month_end, _count)
    ON CONFLICT (tenant_id, period_start)
    DO UPDATE SET 
        whatsapp_messages_sent = tenant_usage.whatsapp_messages_sent + _count,
        updated_at = now();
    
    RETURN true;
END;
$$;

-- 8. Get tenant_id from branch_id
CREATE OR REPLACE FUNCTION public.get_tenant_from_branch(_branch_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.branches WHERE id = _branch_id
$$;

-- =====================================================
-- RLS POLICIES FOR NEW TABLES
-- =====================================================

-- TENANTS table policies
CREATE POLICY "Super admins can manage all tenants"
ON public.tenants FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant members can view own tenant"
ON public.tenants FOR SELECT
USING (public.user_belongs_to_tenant(auth.uid(), id));

-- TENANT_LIMITS table policies
CREATE POLICY "Super admins can manage all limits"
ON public.tenant_limits FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant members can view own limits"
ON public.tenant_limits FOR SELECT
USING (public.user_belongs_to_tenant(auth.uid(), tenant_id));

-- TENANT_USAGE table policies
CREATE POLICY "Super admins can manage all usage"
ON public.tenant_usage FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant members can view own usage"
ON public.tenant_usage FOR SELECT
USING (public.user_belongs_to_tenant(auth.uid(), tenant_id));

-- TENANT_MEMBERS table policies
CREATE POLICY "Super admins can manage all tenant members"
ON public.tenant_members FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant admins can manage their tenant members"
ON public.tenant_members FOR ALL
USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Users can view own tenant membership"
ON public.tenant_members FOR SELECT
USING (user_id = auth.uid());

-- PLATFORM_AUDIT_LOGS table policies
CREATE POLICY "Super admins can view all platform logs"
ON public.platform_audit_logs FOR SELECT
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert platform logs"
ON public.platform_audit_logs FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()) OR auth.role() = 'service_role');

-- TENANT_BILLING_INFO table policies
CREATE POLICY "Super admins can manage all billing"
ON public.tenant_billing_info FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant owners can view own billing"
ON public.tenant_billing_info FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = tenant_billing_info.tenant_id
      AND user_id = auth.uid()
      AND is_owner = true
));

-- Add tenant isolation policy for BRANCHES
CREATE POLICY "Tenant members can access their branches"
ON public.branches FOR ALL
USING (
    tenant_id IS NULL OR -- Backward compatibility for existing data
    public.is_super_admin(auth.uid()) OR
    public.user_belongs_to_tenant(auth.uid(), tenant_id)
);